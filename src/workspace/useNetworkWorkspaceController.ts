import { isServer } from "../lib/runtime/environment";
import { releaseRetainedBlock, type RetainedSession } from "@qterm/services/runtimeSessions";
import { useCallback, type Dispatch } from "react";

import { connectNetworkSession, startNetworkRule, stopNetworkRule } from "@qterm/services/network";
import { acceptHostKey, closeSession, rejectHostKey, type SessionEvent } from "@qterm/services/sessions";
import { completeConnectionProgress, connectionProgressFromRouteEvent, failConnectionProgress } from "./connectionProgress";
import { useRemoteServiceConnection } from "./useRemoteServiceConnection";
import type { WorkspaceAction } from "./reducer";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { connectionIntentAllows, connectionIntentKey, consumeFailureHandler, defaultNetworkRuntime, epochKey, nodeLabel, routeFailureNotice, workspaceErrorMessage } from "./workspaceRuntime";

const initialRemoteRuntime = (session?: RetainedSession) => ({ ...defaultNetworkRuntime, ruleStates: session?.ruleStates ?? {} });

export function useNetworkWorkspaceController(state: WorkspaceRuntimeState, dispatch: Dispatch<WorkspaceAction>) {
  const { networkRuntimes, networkRuntimesRef, connectionTargetIntents, finishedEpochs, connectionFailureHandlers, updateNetworkRuntime, nextEpoch, isCurrentEpoch } = state;

  const onNetworkSessionEvent = useCallback((blockId: string, epoch: number, event: SessionEvent) => {
    if (!isCurrentEpoch(blockId, epoch)) return;
    if (event.type === "stateChanged") {
      if (event.state === "closed" || event.state === "failed") finishedEpochs.current.add(epochKey(blockId, epoch));
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
      updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, hostKeyChange: event, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, "主机密钥已变化"), notice: `${nodeLabel(event.node)}主机密钥已变化：${event.presentedFingerprint}` }));
    } else {
      updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, event.message), notice: routeFailureNotice(event), ruleStates: {} }));
      if (event.node?.role === "target" && event.stage === "authenticate") consumeFailureHandler(connectionFailureHandlers.current, `network:${blockId}`);
    }
  }, [connectionFailureHandlers, finishedEpochs, isCurrentEpoch, updateNetworkRuntime]);

  const closeCurrentNetworkSession = useCallback(async (blockId: string) => {
    const runtime = networkRuntimesRef.current[blockId];
    const epoch = nextEpoch(blockId);
    connectionFailureHandlers.current.delete(`network:${blockId}`);
    if (runtime?.sessionId) await closeSession(runtime.sessionId).catch(() => undefined);
    else if (isServer) await releaseRetainedBlock(blockId);
    if (isCurrentEpoch(blockId, epoch)) updateNetworkRuntime(blockId, () => defaultNetworkRuntime);
  }, [connectionFailureHandlers, isCurrentEpoch, networkRuntimesRef, nextEpoch, updateNetworkRuntime]);
  const disconnectNetworkBlock = useCallback(async (blockId: string) => closeCurrentNetworkSession(blockId), [closeCurrentNetworkSession]);
  const selectNetworkTarget = useCallback(async (workspaceId: string, blockId: string, profileId: string | null) => {
    connectionTargetIntents.current.set(connectionIntentKey("network", blockId), profileId);
    dispatch({ type: "recordRecentProfile", profileId });
    await closeCurrentNetworkSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "network", blockId, profileId)) return;
    dispatch({ type: "setNetworkProfile", workspaceId, blockId, profileId });
  }, [closeCurrentNetworkSession, connectionTargetIntents, dispatch]);
  const { connect: connectNetworkBlock, restore: restoreNetworkSession } = useRemoteServiceConnection(state, {
    kind: "network", runtimes: networkRuntimesRef, update: updateNetworkRuntime,
    initial: initialRemoteRuntime, onEvent: onNetworkSessionEvent, close: closeCurrentNetworkSession, open: connectNetworkSession,
  });
  const restoreNetworkBlock = useCallback(async (session: RetainedSession) => {
    const blockId = session.runtimeKey;
    const runtime = blockId ? networkRuntimesRef.current[blockId] : undefined;
    if (blockId && runtime?.sessionId === session.sessionId && runtime.status === "connected") {
      updateNetworkRuntime(blockId, current => ({ ...current, ruleStates: session.ruleStates ?? {} }));
      return;
    }
    await restoreNetworkSession(session);
  }, [networkRuntimesRef, restoreNetworkSession, updateNetworkRuntime]);
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
  }, [networkRuntimesRef, updateNetworkRuntime]);
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
  }, [networkRuntimesRef, updateNetworkRuntime]);
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

  return { restoreNetworkBlock, selectNetworkTarget, connectNetworkBlock, disconnectNetworkBlock, startNetworkBlockRule, stopNetworkBlockRule, acceptNetworkHostKey, rejectNetworkHostKey, closeCurrentNetworkSession };
}
