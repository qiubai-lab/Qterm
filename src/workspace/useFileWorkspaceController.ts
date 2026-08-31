import { useCallback, type Dispatch } from "react";

import { connectFileSession } from "../lib/tauri/files";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { acceptHostKey, closeSession, rejectHostKey, type SessionAuth, type SessionEvent } from "../lib/tauri/sessions";
import { completeConnectionProgress, connectionProgressFromRouteEvent, failConnectionProgress, initialConnectionProgress } from "./connectionProgress";
import type { WorkspaceAction } from "./reducer";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { connectionIntentAllows, connectionIntentKey, consumeFailureHandler, defaultFileRuntime, epochKey, nodeLabel, routeFailureNotice, workspaceErrorMessage } from "./workspaceRuntime";

export function useFileWorkspaceController(state: WorkspaceRuntimeState, dispatch: Dispatch<WorkspaceAction>) {
  const { fileRuntimes, fileRuntimesRef, connectionTargetIntents, finishedEpochs, connectionFailureHandlers, updateFileRuntime, nextEpoch, isCurrentEpoch } = state;

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
  }, [connectionFailureHandlers, finishedEpochs, isCurrentEpoch, updateFileRuntime]);

  const closeCurrentFileSession = useCallback(async (blockId: string) => {
    const runtime = fileRuntimesRef.current[blockId];
    nextEpoch(blockId);
    connectionFailureHandlers.current.delete(`files:${blockId}`);
    if (runtime?.sessionId) await closeSession(runtime.sessionId).catch(() => undefined);
    updateFileRuntime(blockId, () => defaultFileRuntime);
  }, [connectionFailureHandlers, fileRuntimesRef, nextEpoch, updateFileRuntime]);
  const disconnectFileBlock = useCallback(async (blockId: string) => {
    const remote = fileRuntimesRef.current[blockId]?.kind === "sftp";
    await closeCurrentFileSession(blockId);
    if (remote) updateFileRuntime(blockId, () => ({ ...defaultFileRuntime, kind: "sftp", status: "closed" }));
  }, [closeCurrentFileSession, fileRuntimesRef, updateFileRuntime]);
  const selectFileTarget = useCallback(async (workspaceId: string, blockId: string, profileId: string | null) => {
    connectionTargetIntents.current.set(connectionIntentKey("files", blockId), profileId);
    dispatch({ type: "recordRecentProfile", profileId });
    await closeCurrentFileSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "files", blockId, profileId)) return;
    updateFileRuntime(blockId, () => profileId === null ? defaultFileRuntime : { ...defaultFileRuntime, kind: "sftp", status: "closed" });
    dispatch({ type: "setFilesProfile", workspaceId, blockId, profileId });
    dispatch({ type: "setFilesPath", workspaceId, blockId, profileId, path: profileId === null ? "~" : "." });
  }, [closeCurrentFileSession, connectionTargetIntents, dispatch, updateFileRuntime]);
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
      const sessionId = await connectFileSession({ profileId: profile.id, auth }, (event) => onFileSessionEvent(blockId, epoch, event));
      if (!isCurrentEpoch(blockId, epoch)) await closeSession(sessionId).catch(() => undefined);
      else if (!finishedEpochs.current.has(key)) updateFileRuntime(blockId, (runtime) => ({ ...runtime, sessionId, kind: "sftp" }));
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) updateFileRuntime(blockId, () => ({ ...defaultFileRuntime, kind: "sftp", status: "failed", notice: workspaceErrorMessage(error) }));
      consumeFailureHandler(connectionFailureHandlers.current, `files:${blockId}`);
    }
  }, [closeCurrentFileSession, connectionFailureHandlers, connectionTargetIntents, finishedEpochs, isCurrentEpoch, nextEpoch, onFileSessionEvent, updateFileRuntime]);
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

  return { selectFileTarget, connectFileBlock, disconnectFileBlock, acceptFileHostKey, rejectFileHostKey, closeCurrentFileSession };
}
