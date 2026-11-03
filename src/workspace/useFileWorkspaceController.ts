import { isServer } from "../lib/runtime/environment";
import { releaseRetainedBlock } from "@qterm/services/runtimeSessions";
import { useCallback, type Dispatch } from "react";

import { connectFileSession } from "@qterm/services/files";
import { acceptHostKey, closeSession, rejectHostKey, type SessionEvent } from "@qterm/services/sessions";
import { completeConnectionProgress, connectionProgressFromRouteEvent, failConnectionProgress } from "./connectionProgress";
import { useRemoteServiceConnection } from "./useRemoteServiceConnection";
import type { WorkspaceAction } from "./reducer";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { connectionIntentAllows, connectionIntentKey, consumeFailureHandler, defaultFileRuntime, epochKey, nodeLabel, routeFailureNotice } from "./workspaceRuntime";

const initialRemoteRuntime = () => ({ ...defaultFileRuntime, kind: "sftp" as const, status: "closed" as const });

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
    const epoch = nextEpoch(blockId);
    connectionFailureHandlers.current.delete(`files:${blockId}`);
    if (runtime?.sessionId) await closeSession(runtime.sessionId).catch(() => undefined);
    else if (isServer) await releaseRetainedBlock(blockId);
    if (isCurrentEpoch(blockId, epoch)) updateFileRuntime(blockId, () => runtime?.kind === "sftp" ? { ...defaultFileRuntime, kind: "sftp", status: "closed" } : defaultFileRuntime);
  }, [connectionFailureHandlers, fileRuntimesRef, isCurrentEpoch, nextEpoch, updateFileRuntime]);
  const disconnectFileBlock = useCallback(async (blockId: string) => closeCurrentFileSession(blockId), [closeCurrentFileSession]);
  const selectFileTarget = useCallback(async (workspaceId: string, blockId: string, profileId: string | null) => {
    connectionTargetIntents.current.set(connectionIntentKey("files", blockId), profileId);
    dispatch({ type: "recordRecentProfile", profileId });
    await closeCurrentFileSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "files", blockId, profileId)) return;
    updateFileRuntime(blockId, () => profileId === null ? defaultFileRuntime : { ...defaultFileRuntime, kind: "sftp", status: "closed" });
    dispatch({ type: "setFilesProfile", workspaceId, blockId, profileId });
    dispatch({ type: "setFilesPath", workspaceId, blockId, profileId, path: profileId === null ? "~" : "." });
  }, [closeCurrentFileSession, connectionTargetIntents, dispatch, updateFileRuntime]);
  const { connect: connectFileBlock, restore: restoreFileBlock } = useRemoteServiceConnection(state, {
    kind: "files", runtimes: fileRuntimesRef, update: updateFileRuntime,
    initial: initialRemoteRuntime, onEvent: onFileSessionEvent, close: closeCurrentFileSession, open: connectFileSession,
  });
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

  return { restoreFileBlock, selectFileTarget, connectFileBlock, disconnectFileBlock, acceptFileHostKey, rejectFileHostKey, closeCurrentFileSession };
}
