import { useCallback, type Dispatch } from "react";

import { closeLocalSession, connectLocalSession, resizeLocalSession, writeLocalSession, type LocalSessionEvent } from "../lib/tauri/localSessions";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { acceptHostKey, closeSession, connectSession, rejectHostKey, resizeSession, writeSession, type SessionAuth, type SessionEvent, type TerminalSizeInput } from "../lib/tauri/sessions";
import { completeConnectionProgress, connectionProgressFromRouteEvent, failConnectionProgress, initialConnectionProgress } from "./connectionProgress";
import { findLeaf } from "./layout";
import { createId, type SplitDirection } from "./model";
import type { WorkspaceAction } from "./reducer";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import {
  MAX_PENDING_TERMINAL_OUTPUT,
  connectionIntentAllows,
  connectionIntentKey,
  consumeFailureHandler,
  defaultRuntime,
  deleteFailureHandlers,
  epochKey,
  isTauriRuntime,
  nodeLabel,
  routeFailureNotice,
  terminalFailureKey,
  workspaceErrorMessage,
} from "./workspaceRuntime";

export function useTerminalWorkspaceController(state: WorkspaceRuntimeState, dispatch: Dispatch<WorkspaceAction>) {
  const {
    runtimes, setRuntimes, writers, clearers, terminalSizeReaders, writerOwners, pendingTerminalOutput,
    runtimesRef, documentRef, connectionTargetIntents, finishedEpochs, startingLocal, activeLocalSessions,
    pendingLocalInput, pendingInitialDirectories, connectionFailureHandlers, updateRuntime, nextEpoch, isCurrentEpoch,
  } = state;

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
  }, [pendingTerminalOutput, writers]);

  const clearBlockBuffer = useCallback((blockId: string, reset = false) => {
    pendingTerminalOutput.current.delete(blockId);
    clearers.current.get(blockId)?.(reset);
  }, [clearers, pendingTerminalOutput]);

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
  }, [connectionFailureHandlers, finishedEpochs, isCurrentEpoch, pendingInitialDirectories, pendingTerminalOutput, updateRuntime]);

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
  }, [activeLocalSessions, connectionFailureHandlers, nextEpoch, pendingLocalInput, pendingTerminalOutput, runtimesRef, startingLocal, updateRuntime]);

  const splitTerminalBlock = useCallback((workspaceId: string, blockId: string, direction: SplitDirection, inheritCurrentDirectory = true) => {
    const workspace = documentRef.current.workspaces.find((candidate) => candidate.id === workspaceId);
    const anchor = workspace ? findLeaf(workspace.layout, blockId) : null;
    if (!anchor) return;
    const newBlockId = createId("block");
    if (inheritCurrentDirectory && anchor.type === "terminal") {
      const runtime = runtimesRef.current[blockId];
      const cwd = runtime?.cwd;
      if (runtime?.status === "connected" && runtime.cwdSource === "osc7" && cwd?.trim()) pendingInitialDirectories.current.set(newBlockId, cwd);
    }
    dispatch({ type: "splitBlock", workspaceId, blockId, direction, newBlockId, splitId: createId("split") });
  }, [dispatch, documentRef, pendingInitialDirectories, runtimesRef]);

  const terminalRestoreDirectory = useCallback((blockId: string, profileId: string | null): string | undefined => {
    for (const workspace of documentRef.current.workspaces) {
      const leaf = findLeaf(workspace.layout, blockId);
      if (leaf?.type === "terminal" && leaf.profileId === profileId) return leaf.restoreDirectory ?? undefined;
    }
    return undefined;
  }, [documentRef]);

  const startLocalBlock = useCallback(async (blockId: string, columns: number, rows: number, osc7Enabled: boolean) => {
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
          updateRuntime(blockId, (runtime) => ({ ...runtime, status: event.state, sessionId: event.state === "closed" ? null : runtime.sessionId }));
        },
        (data) => { if (isCurrentEpoch(blockId, epoch)) deliverTerminalOutput(blockId, data); },
        osc7Enabled,
        pendingInitialDirectories.current.get(blockId) ?? (osc7Enabled ? terminalRestoreDirectory(blockId, null) : undefined),
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
          initialCwd: connection.cwd,
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
  }, [activeLocalSessions, clearBlockBuffer, closeCurrentSession, connectionTargetIntents, deliverTerminalOutput, finishedEpochs, isCurrentEpoch, nextEpoch, pendingInitialDirectories, pendingLocalInput, pendingTerminalOutput, runtimesRef, startingLocal, terminalRestoreDirectory, updateRuntime]);

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
        { profileId: profile.id, auth, terminalSize, initialDirectory: pendingInitialDirectories.current.get(blockId) ?? terminalRestoreDirectory(blockId, profile.id) },
        (event) => onSessionEvent(blockId, epoch, event),
        (data) => { if (isCurrentEpoch(blockId, epoch)) deliverTerminalOutput(blockId, data); },
      );
      if (!isCurrentEpoch(blockId, epoch)) await closeSession(sessionId).catch(() => undefined);
      else if (!finishedEpochs.current.has(key)) updateRuntime(blockId, (runtime) => ({ ...runtime, sessionId, kind: "ssh" }));
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) {
        updateRuntime(blockId, () => ({ ...defaultRuntime, kind: "ssh", status: "failed", notice: workspaceErrorMessage(error) }));
        consumeFailureHandler(connectionFailureHandlers.current, failureKey);
      }
    }
  }, [clearBlockBuffer, closeCurrentSession, connectionFailureHandlers, connectionTargetIntents, deliverTerminalOutput, finishedEpochs, isCurrentEpoch, nextEpoch, onSessionEvent, pendingInitialDirectories, terminalRestoreDirectory, terminalSizeReaders, updateRuntime]);

  const restartLocalBlock = useCallback(async (blockId: string, osc7Enabled: boolean) => {
    const size = terminalSizeReaders.current.get(blockId)?.() ?? { columns: 80, rows: 24 };
    await startLocalBlock(blockId, size.columns, size.rows, osc7Enabled);
  }, [startLocalBlock, terminalSizeReaders]);
  const disconnectBlock = useCallback(async (blockId: string) => closeCurrentSession(blockId), [closeCurrentSession]);
  const selectBlockTarget = useCallback(async (workspaceId: string, blockId: string, profileId: string | null) => {
    pendingInitialDirectories.current.delete(blockId);
    connectionTargetIntents.current.set(connectionIntentKey("terminal", blockId), profileId);
    dispatch({ type: "recordRecentProfile", profileId });
    dispatch({ type: "setBlockProfile", workspaceId, blockId, profileId });
    await closeCurrentSession(blockId);
  }, [closeCurrentSession, connectionTargetIntents, dispatch, pendingInitialDirectories]);

  const writeBlock = useCallback(async (blockId: string, data: Uint8Array) => {
    const pending = pendingLocalInput.current.get(blockId);
    if (pending) {
      if (pending.reduce((size, chunk) => size + chunk.byteLength, 0) + data.byteLength <= 64 * 1024) pending.push(data);
      return;
    }
    const activeLocalSessionId = activeLocalSessions.current.get(blockId);
    if (activeLocalSessionId) return writeLocalSession(activeLocalSessionId, data);
    const runtime = runtimesRef.current[blockId];
    if (!runtime?.sessionId) return;
    if (runtime.kind === "local") await writeLocalSession(runtime.sessionId, data);
    else await writeSession(runtime.sessionId, data);
  }, [activeLocalSessions, pendingLocalInput, runtimesRef]);
  const resizeBlock = useCallback(async (blockId: string, columns: number, rows: number) => {
    const runtime = runtimesRef.current[blockId];
    if (!runtime?.sessionId || runtime.status !== "connected") return;
    if (runtime.kind === "local") await resizeLocalSession(runtime.sessionId, columns, rows);
    else await resizeSession(runtime.sessionId, columns, rows);
  }, [runtimesRef]);
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
  }, [clearers, pendingTerminalOutput, terminalSizeReaders, writerOwners, writers]);
  const setBlockCwd = useCallback((blockId: string, cwd: string) => {
    const runtime = runtimesRef.current[blockId];
    if (!runtime?.kind || runtime.status === "closing" || runtime.status === "closed" || runtime.status === "failed") return;
    updateRuntime(blockId, (current) => current.cwd === cwd && current.cwdSource === "osc7" ? current : { ...current, cwd, cwdSource: "osc7" });
    for (const workspace of documentRef.current.workspaces) {
      const leaf = findLeaf(workspace.layout, blockId);
      if (leaf?.type !== "terminal") continue;
      dispatch({ type: "setTerminalRestoreDirectory", workspaceId: workspace.id, blockId, profileId: leaf.profileId, restoreDirectory: cwd });
      break;
    }
  }, [dispatch, documentRef, runtimesRef, updateRuntime]);
  const clearTerminalOsc7State = useCallback(() => {
    pendingInitialDirectories.current.clear();
    dispatch({ type: "clearTerminalRestoreDirectories" });
    setRuntimes((current) => {
      let changed = false;
      const next = { ...current };
      for (const [blockId, runtime] of Object.entries(current)) {
        if (runtime.cwdSource !== "osc7") continue;
        changed = true;
        next[blockId] = { ...runtime, cwd: runtime.initialCwd, cwdSource: runtime.initialCwd ? "initial" : null };
      }
      if (!changed) return current;
      runtimesRef.current = next;
      return next;
    });
  }, [dispatch, pendingInitialDirectories, runtimesRef, setRuntimes]);

  return {
    registerWriter, clearBlockBuffer, setBlockCwd, clearTerminalOsc7State, splitTerminalBlock,
    startLocalBlock, restartLocalBlock, selectBlockTarget, connectBlock, disconnectBlock, writeBlock, resizeBlock,
    acceptBlockHostKey, rejectBlockHostKey, closeCurrentSession,
  };
}
