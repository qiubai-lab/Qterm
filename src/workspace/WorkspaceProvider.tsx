/* eslint-disable react-refresh/only-export-components -- provider and its typed hook are one public boundary. */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from "react";

import { connectFileSession } from "../lib/tauri/files";
import { connectNetworkSession, startNetworkRule, stopNetworkRule } from "../lib/tauri/network";
import { closeLocalSession, connectLocalSession, getLocalTerminalCapabilities, resizeLocalSession, writeLocalSession, type LocalSessionEvent, type LocalTerminalCapabilities } from "../lib/tauri/localSessions";
import { listProfileGroups, listProfiles, type ConnectionProfile, type ProfileGroup } from "../lib/tauri/profiles";
import { acceptHostKey, closeSession, connectSession, rejectHostKey, resizeSession, writeSession, type SessionAuth, type SessionEvent, type TerminalSizeInput } from "../lib/tauri/sessions";
import { loadWorkspaces, saveWorkspaces } from "../lib/tauri/workspaces";
import { completeConnectionProgress, connectionProgressFromRouteEvent, failConnectionProgress, initialConnectionProgress } from "./connectionProgress";
import { blockIds, findLeaf } from "./layout";
import { createId, createWorkspaceDocument, type SplitDirection, type Workspace, type WorkspaceDocument } from "./model";
import { workspaceReducer, type WorkspaceAction } from "./reducer";
import {
  MAX_PENDING_TERMINAL_OUTPUT,
  connectionIntentAllows,
  connectionIntentKey,
  consumeFailureHandler,
  defaultFileRuntime,
  defaultNetworkRuntime,
  defaultRuntime,
  deleteFailureHandlers,
  epochKey,
  isTauriRuntime,
  nodeLabel,
  routeFailureNotice,
  terminalFailureKey,
  workspaceErrorMessage,
  type FileRuntime,
  type NetworkRuntime,
  type TerminalRuntime,
} from "./workspaceRuntime";

export type { FileRuntime, HostKeyPrompt, NetworkRuntime, TerminalRuntime } from "./workspaceRuntime";

interface WorkspaceContextValue {
  hydrated: boolean;
  document: WorkspaceDocument;
  dispatch: Dispatch<WorkspaceAction>;
  profiles: ConnectionProfile[];
  profileGroups: ProfileGroup[];
  refreshProfiles: () => Promise<void>;
  runtimes: Record<string, TerminalRuntime>;
  fileRuntimes: Record<string, FileRuntime>;
  networkRuntimes: Record<string, NetworkRuntime>;
  localTerminalCapabilities: LocalTerminalCapabilities | null;
  activeWorkspace: Workspace;
  activeBlockId: string;
  registerWriter: (blockId: string, writer: (data: Uint8Array) => void, clearer: (reset: boolean) => void, readSize: () => TerminalSizeInput) => () => void;
  clearBlockBuffer: (blockId: string, reset?: boolean) => void;
  setBlockCwd: (blockId: string, cwd: string) => void;
  clearTerminalOsc7State: () => void;
  splitTerminalBlock: (workspaceId: string, blockId: string, direction: SplitDirection, inheritCurrentDirectory?: boolean) => void;
  startLocalBlock: (blockId: string, columns: number, rows: number) => Promise<void>;
  restartLocalBlock: (blockId: string) => Promise<void>;
  selectBlockTarget: (workspaceId: string, blockId: string, profileId: string | null) => Promise<void>;
  connectBlock: (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => Promise<void>;
  selectFileTarget: (workspaceId: string, blockId: string, profileId: string | null) => Promise<void>;
  connectFileBlock: (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => Promise<void>;
  disconnectFileBlock: (blockId: string) => Promise<void>;
  selectNetworkTarget: (workspaceId: string, blockId: string, profileId: string | null) => Promise<void>;
  connectNetworkBlock: (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => Promise<void>;
  disconnectNetworkBlock: (blockId: string) => Promise<void>;
  isConnectionTargetCurrent: (owner: "terminal" | "files" | "network", blockId: string, profileId: string) => boolean;
  startNetworkBlockRule: (blockId: string, ruleId: string) => Promise<void>;
  stopNetworkBlockRule: (blockId: string, ruleId: string) => Promise<void>;
  disconnectBlock: (blockId: string) => Promise<void>;
  writeBlock: (blockId: string, data: Uint8Array) => Promise<void>;
  resizeBlock: (blockId: string, columns: number, rows: number) => Promise<void>;
  acceptBlockHostKey: (blockId: string) => Promise<void>;
  rejectBlockHostKey: (blockId: string) => Promise<void>;
  acceptFileHostKey: (blockId: string) => Promise<void>;
  rejectFileHostKey: (blockId: string) => Promise<void>;
  acceptNetworkHostKey: (blockId: string) => Promise<void>;
  rejectNetworkHostKey: (blockId: string) => Promise<void>;
  connectedCount: (ids: string[]) => number;
  closeSessions: (ids: string[]) => Promise<void>;
  blocksForWorkspace: (workspace: Workspace) => string[];
  storageNotice: string;
  dismissStorageNotice: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [document, dispatch] = useReducer(workspaceReducer, undefined, createWorkspaceDocument);
  const [hydrated, setHydrated] = useState(false);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [profileGroups, setProfileGroups] = useState<ProfileGroup[]>([]);
  const [runtimes, setRuntimes] = useState<Record<string, TerminalRuntime>>({});
  const [fileRuntimes, setFileRuntimes] = useState<Record<string, FileRuntime>>({});
  const [networkRuntimes, setNetworkRuntimes] = useState<Record<string, NetworkRuntime>>({});
  const [localTerminalCapabilities, setLocalTerminalCapabilities] = useState<LocalTerminalCapabilities | null>(null);
  const [storageNotice, setStorageNotice] = useState("");
  const writers = useRef(new Map<string, (data: Uint8Array) => void>());
  const clearers = useRef(new Map<string, (reset: boolean) => void>());
  const terminalSizeReaders = useRef(new Map<string, () => TerminalSizeInput>());
  const writerOwners = useRef(new Map<string, symbol>());
  const pendingTerminalOutput = useRef(new Map<string, { chunks: Uint8Array[]; bytes: number }>());
  const runtimesRef = useRef(runtimes);
  const fileRuntimesRef = useRef(fileRuntimes);
  const networkRuntimesRef = useRef(networkRuntimes);
  const documentRef = useRef(document);
  const sessionEpochs = useRef(new Map<string, number>());
  const connectionTargetIntents = useRef(new Map<string, string | null>());
  const finishedEpochs = useRef(new Set<string>());
  const startingLocal = useRef(new Map<string, number>());
  const activeLocalSessions = useRef(new Map<string, string>());
  const pendingLocalInput = useRef(new Map<string, Uint8Array[]>());
  const pendingInitialDirectories = useRef(new Map<string, string>());
  const connectionFailureHandlers = useRef(new Map<string, () => void>());

  useEffect(() => { runtimesRef.current = runtimes; }, [runtimes]);
  useEffect(() => { fileRuntimesRef.current = fileRuntimes; }, [fileRuntimes]);
  useEffect(() => { networkRuntimesRef.current = networkRuntimes; }, [networkRuntimes]);
  documentRef.current = document;

  const refreshProfiles = useCallback(async () => {
    if (!isTauriRuntime()) return;
    const [items, groups] = await Promise.all([listProfiles(), listProfileGroups()]);
    setProfiles(items);
    setProfileGroups(groups);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setHydrated(true);
      return;
    }
    let active = true;
    void Promise.all([loadWorkspaces(), listProfiles(), listProfileGroups()]).then(
      ([stored, items, groups]) => {
        if (!active) return;
        if (stored) dispatch({ type: "hydrate", document: stored });
        setProfiles(items);
        setProfileGroups(groups);
        setHydrated(true);
      },
      (error: unknown) => {
        if (!active) return;
        setStorageNotice(`无法读取本地工作区：${workspaceErrorMessage(error)}`);
        setHydrated(true);
      },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || !isTauriRuntime()) return;
    const timer = window.setTimeout(() => {
      void saveWorkspaces(document).catch((error: unknown) => setStorageNotice(`无法保存工作区：${workspaceErrorMessage(error)}`));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [document, hydrated]);

  const updateRuntime = useCallback((blockId: string, update: (current: TerminalRuntime) => TerminalRuntime) => {
    setRuntimes((current) => {
      const next = { ...current, [blockId]: update(current[blockId] ?? defaultRuntime) };
      runtimesRef.current = next;
      return next;
    });
  }, []);

  const updateFileRuntime = useCallback((blockId: string, update: (current: FileRuntime) => FileRuntime) => {
    setFileRuntimes((current) => {
      const next = { ...current, [blockId]: update(current[blockId] ?? defaultFileRuntime) };
      fileRuntimesRef.current = next;
      return next;
    });
  }, []);

  const updateNetworkRuntime = useCallback((blockId: string, update: (current: NetworkRuntime) => NetworkRuntime) => {
    setNetworkRuntimes((current) => {
      const next = { ...current, [blockId]: update(current[blockId] ?? defaultNetworkRuntime) };
      networkRuntimesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    void getLocalTerminalCapabilities().then(
      (capabilities) => { if (active) setLocalTerminalCapabilities(capabilities); },
      (error: unknown) => {
        if (active) setStorageNotice((current) => current || `无法读取本地终端能力：${workspaceErrorMessage(error)}`);
      },
    );
    return () => { active = false; };
  }, []);

  const nextEpoch = useCallback((blockId: string) => {
    const epoch = (sessionEpochs.current.get(blockId) ?? 0) + 1;
    sessionEpochs.current.set(blockId, epoch);
    return epoch;
  }, []);

  const deliverTerminalOutput = useCallback((blockId: string, data: Uint8Array) => {
    const writer = writers.current.get(blockId);
    if (writer) {
      writer(data);
      return;
    }
    const chunk = data.byteLength > MAX_PENDING_TERMINAL_OUTPUT ? data.slice(-MAX_PENDING_TERMINAL_OUTPUT) : data.slice();
    const pending = pendingTerminalOutput.current.get(blockId) ?? { chunks: [], bytes: 0 };
    while (pending.chunks.length > 0 && pending.bytes + chunk.byteLength > MAX_PENDING_TERMINAL_OUTPUT) {
      pending.bytes -= pending.chunks.shift()!.byteLength;
    }
    pending.chunks.push(chunk);
    pending.bytes += chunk.byteLength;
    pendingTerminalOutput.current.set(blockId, pending);
  }, []);

  const clearBlockBuffer = useCallback((blockId: string, reset = false) => {
    pendingTerminalOutput.current.delete(blockId);
    clearers.current.get(blockId)?.(reset);
  }, []);

  const isCurrentEpoch = useCallback((blockId: string, epoch: number) => sessionEpochs.current.get(blockId) === epoch, []);
  const onSessionEvent = useCallback((blockId: string, epoch: number, event: SessionEvent) => {
    if (!isCurrentEpoch(blockId, epoch)) return;
    if (event.type === "stateChanged") {
      if (event.state === "closed" || event.state === "failed") finishedEpochs.current.add(epochKey(blockId, epoch));
      if (event.state === "closed" || event.state === "failed") pendingTerminalOutput.current.delete(blockId);
      updateRuntime(blockId, (runtime) => ({
        ...runtime,
        status: event.state,
        sessionId: event.state === "closed" || event.state === "failed" ? null : runtime.sessionId,
        notice: event.state === "connected" ? "" : runtime.notice,
        connectionProgress: event.state === "connected"
          ? completeConnectionProgress(runtime.connectionProgress)
          : event.state === "failed" ? failConnectionProgress(runtime.connectionProgress, null, "连接失败")
            : event.state === "closed" ? null : runtime.connectionProgress,
      }));
      if (event.state === "connected") {
        pendingInitialDirectories.current.delete(blockId);
        connectionFailureHandlers.current.delete(terminalFailureKey(blockId, epoch));
      }
    } else if (event.type === "routeProgress") {
      updateRuntime(blockId, (runtime) => ({ ...runtime, notice: "", connectionProgress: connectionProgressFromRouteEvent(event, runtime.connectionProgress) }));
    } else if (event.type === "hostKeyConfirmationRequired") {
      updateRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: event }));
    } else if (event.type === "hostKeyChanged") {
      updateRuntime(blockId, (runtime) => ({ ...runtime, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, "主机密钥已变化"), notice: `${nodeLabel(event.node)}主机密钥已变化：${event.presentedFingerprint}` }));
    } else {
      updateRuntime(blockId, (runtime) => ({ ...runtime, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, event.message), notice: routeFailureNotice(event) }));
      if (event.node?.role === "target" && event.stage === "authenticate") consumeFailureHandler(connectionFailureHandlers.current, terminalFailureKey(blockId, epoch));
    }
  }, [isCurrentEpoch, updateRuntime]);

  const onFileSessionEvent = useCallback((blockId: string, epoch: number, event: SessionEvent) => {
    if (!isCurrentEpoch(blockId, epoch)) return;
    if (event.type === "stateChanged") {
      if (event.state === "closed" || event.state === "failed") finishedEpochs.current.add(epochKey(blockId, epoch));
      updateFileRuntime(blockId, (runtime) => ({
        ...runtime,
        status: event.state,
        sessionId: event.state === "closed" || event.state === "failed" ? null : runtime.sessionId,
        notice: event.state === "connected" ? "" : runtime.notice,
        connectionProgress: event.state === "connected"
          ? completeConnectionProgress(runtime.connectionProgress)
          : event.state === "failed" ? failConnectionProgress(runtime.connectionProgress, null, "连接失败")
            : event.state === "closed" ? null : runtime.connectionProgress,
      }));
      if (event.state === "connected") connectionFailureHandlers.current.delete(`files:${blockId}`);
    } else if (event.type === "routeProgress") {
      updateFileRuntime(blockId, (runtime) => ({ ...runtime, notice: "", connectionProgress: connectionProgressFromRouteEvent(event, runtime.connectionProgress) }));
    } else if (event.type === "hostKeyConfirmationRequired") {
      updateFileRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: event }));
    } else if (event.type === "hostKeyChanged") {
      updateFileRuntime(blockId, (runtime) => ({ ...runtime, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, "主机密钥已变化"), notice: `${nodeLabel(event.node)}主机密钥已变化：${event.presentedFingerprint}` }));
    } else {
      updateFileRuntime(blockId, (runtime) => ({ ...runtime, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, event.message), notice: routeFailureNotice(event) }));
      if (event.node?.role === "target" && event.stage === "authenticate") consumeFailureHandler(connectionFailureHandlers.current, `files:${blockId}`);
    }
  }, [isCurrentEpoch, updateFileRuntime]);

  const onNetworkSessionEvent = useCallback((blockId: string, epoch: number, event: SessionEvent) => {
    if (!isCurrentEpoch(blockId, epoch)) return;
    if (event.type === "stateChanged") {
      updateNetworkRuntime(blockId, (runtime) => ({
        ...runtime,
        status: event.state,
        sessionId: event.state === "closed" || event.state === "failed" ? null : runtime.sessionId,
        notice: event.state === "connected" ? "" : runtime.notice,
        connectionProgress: event.state === "connected"
          ? completeConnectionProgress(runtime.connectionProgress)
          : event.state === "failed" ? failConnectionProgress(runtime.connectionProgress, null, "连接失败")
            : event.state === "closed" ? null : runtime.connectionProgress,
        ruleStates: event.state === "closed" || event.state === "failed" ? {} : runtime.ruleStates,
      }));
      if (event.state === "connected") connectionFailureHandlers.current.delete(`network:${blockId}`);
    } else if (event.type === "routeProgress") {
      updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, notice: "", connectionProgress: connectionProgressFromRouteEvent(event, runtime.connectionProgress) }));
    } else if (event.type === "hostKeyConfirmationRequired") {
      updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: event }));
    } else if (event.type === "hostKeyChanged") {
      updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, "主机密钥已变化"), notice: `${nodeLabel(event.node)}主机密钥已变化：${event.presentedFingerprint}` }));
    } else {
      updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, event.message), notice: routeFailureNotice(event), ruleStates: {} }));
      if (event.node?.role === "target" && event.stage === "authenticate") consumeFailureHandler(connectionFailureHandlers.current, `network:${blockId}`);
    }
  }, [isCurrentEpoch, updateNetworkRuntime]);

  const closeCurrentSession = useCallback(async (blockId: string) => {
    const runtime = runtimesRef.current[blockId];
    const activeLocalSessionId = activeLocalSessions.current.get(blockId);
    nextEpoch(blockId);
    startingLocal.current.delete(blockId);
    activeLocalSessions.current.delete(blockId);
    pendingLocalInput.current.delete(blockId);
    pendingTerminalOutput.current.delete(blockId);
    deleteFailureHandlers(connectionFailureHandlers.current, `terminal:${blockId}:`);
    const sessionId = activeLocalSessionId ?? runtime?.sessionId;
    updateRuntime(blockId, () => defaultRuntime);
    if (sessionId) {
      try {
        if (activeLocalSessionId || runtime?.kind === "local") await closeLocalSession(sessionId);
        else await closeSession(sessionId);
      } catch {
        // The process may already have exited; the local runtime is cleared either way.
      }
    }
  }, [nextEpoch, updateRuntime]);

  const closeCurrentFileSession = useCallback(async (blockId: string) => {
    const runtime = fileRuntimesRef.current[blockId];
    nextEpoch(blockId);
    connectionFailureHandlers.current.delete(`files:${blockId}`);
    if (runtime?.sessionId) await closeSession(runtime.sessionId).catch(() => undefined);
    updateFileRuntime(blockId, () => defaultFileRuntime);
  }, [nextEpoch, updateFileRuntime]);

  const closeCurrentNetworkSession = useCallback(async (blockId: string) => {
    const runtime = networkRuntimesRef.current[blockId];
    nextEpoch(blockId);
    connectionFailureHandlers.current.delete(`network:${blockId}`);
    if (runtime?.sessionId) await closeSession(runtime.sessionId).catch(() => undefined);
    updateNetworkRuntime(blockId, () => defaultNetworkRuntime);
  }, [nextEpoch, updateNetworkRuntime]);

  const disconnectFileBlock = useCallback(async (blockId: string) => {
    const remote = fileRuntimesRef.current[blockId]?.kind === "sftp";
    await closeCurrentFileSession(blockId);
    if (remote) updateFileRuntime(blockId, () => ({ ...defaultFileRuntime, kind: "sftp", status: "closed" }));
  }, [closeCurrentFileSession, updateFileRuntime]);

  const disconnectNetworkBlock = useCallback(async (blockId: string) => {
    await closeCurrentNetworkSession(blockId);
  }, [closeCurrentNetworkSession]);

  const splitTerminalBlock = useCallback((workspaceId: string, blockId: string, direction: SplitDirection, inheritCurrentDirectory = true) => {
    const workspace = documentRef.current.workspaces.find((candidate) => candidate.id === workspaceId);
    const anchor = workspace ? findLeaf(workspace.layout, blockId) : null;
    if (!anchor) return;
    const newBlockId = createId("block");
    if (inheritCurrentDirectory && anchor.type === "terminal") {
      const runtime = runtimesRef.current[blockId];
      const cwd = runtime?.cwd;
      if (runtime?.status === "connected" && runtime.cwdSource === "osc7" && cwd?.trim()) {
        pendingInitialDirectories.current.set(newBlockId, cwd);
      }
    }
    dispatch({ type: "splitBlock", workspaceId, blockId, direction, newBlockId, splitId: createId("split") });
  }, []);

  const startLocalBlock = useCallback(async (blockId: string, columns: number, rows: number) => {
    if (!isTauriRuntime() || startingLocal.current.has(blockId)) return;
    if (!connectionIntentAllows(connectionTargetIntents.current, "terminal", blockId, null)) return;
    const current = runtimesRef.current[blockId];
    if (current?.kind === "local" && current.sessionId) return;
    if (current?.sessionId) await closeCurrentSession(blockId);
    clearBlockBuffer(blockId, true);
    const epoch = nextEpoch(blockId);
    startingLocal.current.set(blockId, epoch);
    pendingLocalInput.current.set(blockId, []);
    pendingTerminalOutput.current.delete(blockId);
    const key = epochKey(blockId, epoch);
    finishedEpochs.current.delete(key);
    updateRuntime(blockId, () => ({ ...defaultRuntime, kind: "local", status: "connecting" }));
    let startedSessionId: string | null = null;
    try {
      const connection = await connectLocalSession(
        columns,
        rows,
        (event: LocalSessionEvent) => {
          if (!isCurrentEpoch(blockId, epoch)) return;
          if (event.state === "closed") finishedEpochs.current.add(key);
          if (event.state === "closed") {
            activeLocalSessions.current.delete(blockId);
            pendingTerminalOutput.current.delete(blockId);
          }
          updateRuntime(blockId, (runtime) => ({
            ...runtime,
            status: event.state,
            sessionId: event.state === "closed" ? null : runtime.sessionId,
          }));
        },
        (data) => {
          if (isCurrentEpoch(blockId, epoch)) deliverTerminalOutput(blockId, data);
        },
        pendingInitialDirectories.current.get(blockId),
      );
      const { sessionId } = connection;
      startedSessionId = sessionId;
      if (!isCurrentEpoch(blockId, epoch)) {
        await closeLocalSession(sessionId).catch(() => undefined);
      } else if (!finishedEpochs.current.has(key)) {
        activeLocalSessions.current.set(blockId, sessionId);
        const pending = pendingLocalInput.current.get(blockId) ?? [];
        while (pending.length > 0) await writeLocalSession(sessionId, pending.shift()!);
        updateRuntime(blockId, (runtime) => ({
          ...runtime,
          sessionId,
          kind: "local",
          status: "connected",
          cwd: runtime.cwdSource === "osc7" ? runtime.cwd : connection.cwd,
          cwdSource: runtime.cwdSource === "osc7" ? "osc7" : "initial",
        }));
        pendingInitialDirectories.current.delete(blockId);
        pendingLocalInput.current.delete(blockId);
      }
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) {
        activeLocalSessions.current.delete(blockId);
        if (startedSessionId) await closeLocalSession(startedSessionId).catch(() => undefined);
        pendingLocalInput.current.delete(blockId);
        updateRuntime(blockId, () => ({ ...defaultRuntime, kind: "local", status: "failed", notice: workspaceErrorMessage(error) }));
      }
    } finally {
      if (startingLocal.current.get(blockId) === epoch) startingLocal.current.delete(blockId);
      if (isCurrentEpoch(blockId, epoch)) pendingLocalInput.current.delete(blockId);
    }
  }, [clearBlockBuffer, closeCurrentSession, deliverTerminalOutput, isCurrentEpoch, nextEpoch, updateRuntime]);

  const connectBlock = useCallback(async (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => {
    if (!connectionIntentAllows(connectionTargetIntents.current, "terminal", blockId, profile.id)) return;
    await closeCurrentSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "terminal", blockId, profile.id)) return;
    clearBlockBuffer(blockId, true);
    const epoch = nextEpoch(blockId);
    const failureKey = terminalFailureKey(blockId, epoch);
    if (onFailure) connectionFailureHandlers.current.set(failureKey, onFailure);
    const key = epochKey(blockId, epoch);
    finishedEpochs.current.delete(key);
    const terminalSize = terminalSizeReaders.current.get(blockId)?.() ?? { columns: 80, rows: 24 };
    updateRuntime(blockId, () => ({ ...defaultRuntime, kind: "ssh", status: "connecting", connectionProgress: initialConnectionProgress(profile.jumpProfileIds?.length ?? 0) }));
    try {
      const sessionId = await connectSession(
        { profileId: profile.id, auth, terminalSize, initialDirectory: pendingInitialDirectories.current.get(blockId) },
        (event) => onSessionEvent(blockId, epoch, event),
        (data) => { if (isCurrentEpoch(blockId, epoch)) deliverTerminalOutput(blockId, data); },
      );
      if (!isCurrentEpoch(blockId, epoch)) {
        await closeSession(sessionId).catch(() => undefined);
      } else if (!finishedEpochs.current.has(key)) {
        updateRuntime(blockId, (runtime) => ({ ...runtime, sessionId, kind: "ssh" }));
      }
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) {
        updateRuntime(blockId, () => ({ ...defaultRuntime, kind: "ssh", status: "failed", notice: workspaceErrorMessage(error) }));
        consumeFailureHandler(connectionFailureHandlers.current, failureKey);
      }
    }
  }, [clearBlockBuffer, closeCurrentSession, deliverTerminalOutput, isCurrentEpoch, nextEpoch, onSessionEvent, updateRuntime]);

  const restartLocalBlock = useCallback(async (blockId: string) => {
    const size = terminalSizeReaders.current.get(blockId)?.() ?? { columns: 80, rows: 24 };
    await startLocalBlock(blockId, size.columns, size.rows);
  }, [startLocalBlock]);

  const disconnectBlock = useCallback(async (blockId: string) => {
    await closeCurrentSession(blockId);
  }, [closeCurrentSession]);

  const selectBlockTarget = useCallback(async (workspaceId: string, blockId: string, profileId: string | null) => {
    pendingInitialDirectories.current.delete(blockId);
    connectionTargetIntents.current.set(connectionIntentKey("terminal", blockId), profileId);
    dispatch({ type: "recordRecentProfile", profileId });
    dispatch({ type: "setBlockProfile", workspaceId, blockId, profileId });
    await closeCurrentSession(blockId);
  }, [closeCurrentSession]);

  const isConnectionTargetCurrent = useCallback((owner: "terminal" | "files" | "network", blockId: string, profileId: string) => {
    const intentKey = connectionIntentKey(owner, blockId);
    if (connectionTargetIntents.current.has(intentKey)) return connectionTargetIntents.current.get(intentKey) === profileId;
    for (const workspace of documentRef.current.workspaces) {
      const leaf = findLeaf(workspace.layout, blockId);
      if (!leaf || leaf.type !== owner) continue;
      return leaf.profileId === profileId;
    }
    return false;
  }, []);

  const selectFileTarget = useCallback(async (workspaceId: string, blockId: string, profileId: string | null) => {
    connectionTargetIntents.current.set(connectionIntentKey("files", blockId), profileId);
    dispatch({ type: "recordRecentProfile", profileId });
    await closeCurrentFileSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "files", blockId, profileId)) return;
    updateFileRuntime(blockId, () => profileId === null ? defaultFileRuntime : { ...defaultFileRuntime, kind: "sftp", status: "closed" });
    dispatch({ type: "setFilesProfile", workspaceId, blockId, profileId });
    dispatch({ type: "setFilesPath", workspaceId, blockId, profileId, path: profileId === null ? "~" : "." });
  }, [closeCurrentFileSession, updateFileRuntime]);

  const connectFileBlock = useCallback(async (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => {
    if (!connectionIntentAllows(connectionTargetIntents.current, "files", blockId, profile.id)) return;
    await closeCurrentFileSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "files", blockId, profile.id)) return;
    if (onFailure) connectionFailureHandlers.current.set(`files:${blockId}`, onFailure);
    const epoch = nextEpoch(blockId);
    const key = epochKey(blockId, epoch);
    finishedEpochs.current.delete(key);
    updateFileRuntime(blockId, () => ({ ...defaultFileRuntime, kind: "sftp", status: "connecting", connectionProgress: initialConnectionProgress(profile.jumpProfileIds?.length ?? 0) }));
    try {
      const sessionId = await connectFileSession(
        { profileId: profile.id, auth },
        (event) => onFileSessionEvent(blockId, epoch, event),
      );
      if (!isCurrentEpoch(blockId, epoch)) {
        await closeSession(sessionId).catch(() => undefined);
      } else if (!finishedEpochs.current.has(key)) {
        updateFileRuntime(blockId, (runtime) => ({ ...runtime, sessionId, kind: "sftp" }));
      }
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) updateFileRuntime(blockId, () => ({ ...defaultFileRuntime, kind: "sftp", status: "failed", notice: workspaceErrorMessage(error) }));
      consumeFailureHandler(connectionFailureHandlers.current, `files:${blockId}`);
    }
  }, [closeCurrentFileSession, isCurrentEpoch, nextEpoch, onFileSessionEvent, updateFileRuntime]);

  const selectNetworkTarget = useCallback(async (workspaceId: string, blockId: string, profileId: string | null) => {
    connectionTargetIntents.current.set(connectionIntentKey("network", blockId), profileId);
    dispatch({ type: "recordRecentProfile", profileId });
    await closeCurrentNetworkSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "network", blockId, profileId)) return;
    dispatch({ type: "setNetworkProfile", workspaceId, blockId, profileId });
  }, [closeCurrentNetworkSession]);

  const connectNetworkBlock = useCallback(async (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => {
    if (!connectionIntentAllows(connectionTargetIntents.current, "network", blockId, profile.id)) return;
    await closeCurrentNetworkSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "network", blockId, profile.id)) return;
    if (onFailure) connectionFailureHandlers.current.set(`network:${blockId}`, onFailure);
    const epoch = nextEpoch(blockId);
    updateNetworkRuntime(blockId, () => ({ ...defaultNetworkRuntime, status: "connecting", connectionProgress: initialConnectionProgress(profile.jumpProfileIds?.length ?? 0) }));
    try {
      const sessionId = await connectNetworkSession(
        { profileId: profile.id, auth },
        (event) => onNetworkSessionEvent(blockId, epoch, event),
      );
      if (!isCurrentEpoch(blockId, epoch)) await closeSession(sessionId).catch(() => undefined);
      else updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, sessionId }));
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) updateNetworkRuntime(blockId, () => ({ ...defaultNetworkRuntime, status: "failed", notice: workspaceErrorMessage(error) }));
      consumeFailureHandler(connectionFailureHandlers.current, `network:${blockId}`);
    }
  }, [closeCurrentNetworkSession, isCurrentEpoch, nextEpoch, onNetworkSessionEvent, updateNetworkRuntime]);

  const startNetworkBlockRule = useCallback(async (blockId: string, ruleId: string) => {
    const runtime = networkRuntimesRef.current[blockId];
    if (!runtime?.sessionId || runtime.status !== "connected") throw new Error("网络 SSH 会话尚未连接");
    updateNetworkRuntime(blockId, (current) => ({ ...current, notice: "", ruleStates: { ...current.ruleStates, [ruleId]: "starting" } }));
    try {
      await startNetworkRule(runtime.sessionId, ruleId);
      updateNetworkRuntime(blockId, (current) => ({ ...current, ruleStates: { ...current.ruleStates, [ruleId]: "running" } }));
    } catch (error) {
      updateNetworkRuntime(blockId, (current) => ({ ...current, notice: workspaceErrorMessage(error), ruleStates: { ...current.ruleStates, [ruleId]: "failed" } }));
      throw error;
    }
  }, [updateNetworkRuntime]);

  const stopNetworkBlockRule = useCallback(async (blockId: string, ruleId: string) => {
    const runtime = networkRuntimesRef.current[blockId];
    if (!runtime?.sessionId) return;
    updateNetworkRuntime(blockId, (current) => ({ ...current, ruleStates: { ...current.ruleStates, [ruleId]: "stopping" } }));
    try {
      await stopNetworkRule(runtime.sessionId, ruleId);
      updateNetworkRuntime(blockId, (current) => ({ ...current, ruleStates: { ...current.ruleStates, [ruleId]: "stopped" } }));
    } catch (error) {
      updateNetworkRuntime(blockId, (current) => ({ ...current, notice: workspaceErrorMessage(error), ruleStates: { ...current.ruleStates, [ruleId]: "failed" } }));
      throw error;
    }
  }, [updateNetworkRuntime]);

  const writeBlock = useCallback(async (blockId: string, data: Uint8Array) => {
    const pending = pendingLocalInput.current.get(blockId);
    if (pending) {
      if (pending.reduce((size, chunk) => size + chunk.byteLength, 0) + data.byteLength <= 64 * 1024) pending.push(data);
      return;
    }
    const activeLocalSessionId = activeLocalSessions.current.get(blockId);
    if (activeLocalSessionId) {
      await writeLocalSession(activeLocalSessionId, data);
      return;
    }
    const runtime = runtimesRef.current[blockId];
    if (!runtime?.sessionId) return;
    if (runtime.kind === "local") await writeLocalSession(runtime.sessionId, data);
    else await writeSession(runtime.sessionId, data);
  }, []);

  const resizeBlock = useCallback(async (blockId: string, columns: number, rows: number) => {
    const runtime = runtimesRef.current[blockId];
    if (!runtime?.sessionId || runtime.status !== "connected") return;
    if (runtime.kind === "local") await resizeLocalSession(runtime.sessionId, columns, rows);
    else await resizeSession(runtime.sessionId, columns, rows);
  }, []);

  const acceptBlockHostKey = useCallback(async (blockId: string) => {
    const sessionId = runtimes[blockId]?.sessionId;
    if (sessionId) await acceptHostKey(sessionId);
    updateRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: null }));
  }, [runtimes, updateRuntime]);

  const rejectBlockHostKey = useCallback(async (blockId: string) => {
    const sessionId = runtimes[blockId]?.sessionId;
    if (sessionId) await rejectHostKey(sessionId);
    updateRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: null }));
  }, [runtimes, updateRuntime]);

  const acceptFileHostKey = useCallback(async (blockId: string) => {
    const sessionId = fileRuntimes[blockId]?.sessionId;
    if (sessionId) await acceptHostKey(sessionId);
    updateFileRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: null }));
  }, [fileRuntimes, updateFileRuntime]);

  const rejectFileHostKey = useCallback(async (blockId: string) => {
    const sessionId = fileRuntimes[blockId]?.sessionId;
    if (sessionId) await rejectHostKey(sessionId);
    updateFileRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: null }));
  }, [fileRuntimes, updateFileRuntime]);

  const acceptNetworkHostKey = useCallback(async (blockId: string) => {
    const sessionId = networkRuntimes[blockId]?.sessionId;
    if (sessionId) await acceptHostKey(sessionId);
    updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: null }));
  }, [networkRuntimes, updateNetworkRuntime]);

  const rejectNetworkHostKey = useCallback(async (blockId: string) => {
    const sessionId = networkRuntimes[blockId]?.sessionId;
    if (sessionId) await rejectHostKey(sessionId);
    updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: null }));
  }, [networkRuntimes, updateNetworkRuntime]);

  const registerWriter = useCallback((blockId: string, writer: (data: Uint8Array) => void, clearer: (reset: boolean) => void, readSize: () => TerminalSizeInput) => {
    const owner = Symbol(blockId);
    writers.current.set(blockId, writer);
    clearers.current.set(blockId, clearer);
    terminalSizeReaders.current.set(blockId, readSize);
    writerOwners.current.set(blockId, owner);
    const pending = pendingTerminalOutput.current.get(blockId);
    pendingTerminalOutput.current.delete(blockId);
    pending?.chunks.forEach((chunk) => writer(chunk));
    return () => {
      if (writerOwners.current.get(blockId) !== owner) return;
      writerOwners.current.delete(blockId);
      writers.current.delete(blockId);
      clearers.current.delete(blockId);
      terminalSizeReaders.current.delete(blockId);
    };
  }, []);
  const setBlockCwd = useCallback((blockId: string, cwd: string) => {
    updateRuntime(blockId, (runtime) => ({ ...runtime, cwd, cwdSource: "osc7" }));
  }, [updateRuntime]);
  const clearTerminalOsc7State = useCallback(() => {
    pendingInitialDirectories.current.clear();
    setRuntimes((current) => {
      let changed = false;
      const next = Object.fromEntries(Object.entries(current).map(([blockId, runtime]) => {
        if (runtime.cwdSource !== "osc7") return [blockId, runtime];
        changed = true;
        return [blockId, { ...runtime, cwd: null, cwdSource: null }];
      }));
      if (!changed) return current;
      runtimesRef.current = next;
      return next;
    });
  }, []);

  const blocksForWorkspace = useCallback((workspace: Workspace) => blockIds(workspace.layout), []);
  const dismissStorageNotice = useCallback(() => setStorageNotice(""), []);
  const connectedCount = useCallback((ids: string[]) => ids.filter((id) => Boolean(runtimes[id]?.sessionId || fileRuntimes[id]?.sessionId || networkRuntimes[id]?.sessionId)).length, [fileRuntimes, networkRuntimes, runtimes]);
  const closeSessions = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map(async (id) => {
      if (runtimesRef.current[id]) await closeCurrentSession(id);
      if (fileRuntimesRef.current[id]) await closeCurrentFileSession(id);
      if (networkRuntimesRef.current[id]) await closeCurrentNetworkSession(id);
      writers.current.delete(id);
      clearers.current.delete(id);
      terminalSizeReaders.current.delete(id);
      writerOwners.current.delete(id);
      pendingTerminalOutput.current.delete(id);
      pendingInitialDirectories.current.delete(id);
      connectionTargetIntents.current.delete(connectionIntentKey("terminal", id));
      connectionTargetIntents.current.delete(connectionIntentKey("files", id));
      connectionTargetIntents.current.delete(connectionIntentKey("network", id));
    }));
    setRuntimes((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      runtimesRef.current = next;
      return next;
    });
    setFileRuntimes((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      fileRuntimesRef.current = next;
      return next;
    });
    setNetworkRuntimes((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      networkRuntimesRef.current = next;
      return next;
    });
  }, [closeCurrentFileSession, closeCurrentNetworkSession, closeCurrentSession]);

  const activeWorkspace = document.workspaces.find((workspace) => workspace.id === document.activeWorkspaceId) ?? document.workspaces[0];
  const value = useMemo<WorkspaceContextValue>(() => ({
    hydrated, document, dispatch, profiles, profileGroups, refreshProfiles, runtimes, fileRuntimes, networkRuntimes, localTerminalCapabilities, activeWorkspace,
    activeBlockId: activeWorkspace.activeBlockId, registerWriter, clearBlockBuffer, setBlockCwd, clearTerminalOsc7State, splitTerminalBlock, startLocalBlock, restartLocalBlock, selectBlockTarget, connectBlock, disconnectBlock,
    selectFileTarget, connectFileBlock, disconnectFileBlock, selectNetworkTarget, connectNetworkBlock, disconnectNetworkBlock, startNetworkBlockRule, stopNetworkBlockRule, writeBlock, resizeBlock,
    isConnectionTargetCurrent,
    acceptBlockHostKey, rejectBlockHostKey, acceptFileHostKey, rejectFileHostKey, acceptNetworkHostKey, rejectNetworkHostKey, connectedCount,
    closeSessions, blocksForWorkspace,
    storageNotice, dismissStorageNotice,
  }), [hydrated, document, profiles, profileGroups, refreshProfiles, runtimes, fileRuntimes, networkRuntimes, localTerminalCapabilities, activeWorkspace, registerWriter, clearBlockBuffer, setBlockCwd, clearTerminalOsc7State, splitTerminalBlock, startLocalBlock, restartLocalBlock, selectBlockTarget, connectBlock, disconnectBlock, selectFileTarget, connectFileBlock, disconnectFileBlock, selectNetworkTarget, connectNetworkBlock, disconnectNetworkBlock, startNetworkBlockRule, stopNetworkBlockRule, writeBlock, resizeBlock, acceptBlockHostKey, rejectBlockHostKey, acceptFileHostKey, rejectFileHostKey, acceptNetworkHostKey, rejectNetworkHostKey, isConnectionTargetCurrent, connectedCount, closeSessions, blocksForWorkspace, storageNotice, dismissStorageNotice]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceProvider is missing");
  return context;
}
