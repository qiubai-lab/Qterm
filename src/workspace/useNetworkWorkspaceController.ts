import { useCallback, type Dispatch } from "react";

import { connectNetworkSession, startNetworkRule, stopNetworkRule } from "../lib/tauri/network";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { acceptHostKey, closeSession, rejectHostKey, type SessionAuth, type SessionEvent } from "../lib/tauri/sessions";
import { completeConnectionProgress, connectionProgressFromRouteEvent, failConnectionProgress, initialConnectionProgress } from "./connectionProgress";
import type { WorkspaceAction } from "./reducer";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { connectionIntentAllows, connectionIntentKey, consumeFailureHandler, defaultNetworkRuntime, nodeLabel, routeFailureNotice, workspaceErrorMessage } from "./workspaceRuntime";

export function useNetworkWorkspaceController(state: WorkspaceRuntimeState, dispatch: Dispatch<WorkspaceAction>) {
  const { networkRuntimes, networkRuntimesRef, connectionTargetIntents, connectionFailureHandlers, updateNetworkRuntime, nextEpoch, isCurrentEpoch } = state;

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
  }, [connectionFailureHandlers, isCurrentEpoch, updateNetworkRuntime]);

  const closeCurrentNetworkSession = useCallback(async (blockId: string) => {
    const runtime = networkRuntimesRef.current[blockId];
    nextEpoch(blockId);
    connectionFailureHandlers.current.delete(`network:${blockId}`);
    if (runtime?.sessionId) await closeSession(runtime.sessionId).catch(() => undefined);
    updateNetworkRuntime(blockId, () => defaultNetworkRuntime);
  }, [connectionFailureHandlers, networkRuntimesRef, nextEpoch, updateNetworkRuntime]);
  const disconnectNetworkBlock = useCallback(async (blockId: string) => closeCurrentNetworkSession(blockId), [closeCurrentNetworkSession]);
  const selectNetworkTarget = useCallback(async (workspaceId: string, blockId: string, profileId: string | null) => {
    connectionTargetIntents.current.set(connectionIntentKey("network", blockId), profileId);
    dispatch({ type: "recordRecentProfile", profileId });
    await closeCurrentNetworkSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "network", blockId, profileId)) return;
    dispatch({ type: "setNetworkProfile", workspaceId, blockId, profileId });
  }, [closeCurrentNetworkSession, connectionTargetIntents, dispatch]);
  const connectNetworkBlock = useCallback(async (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => {
    if (!connectionIntentAllows(connectionTargetIntents.current, "network", blockId, profile.id)) return;
    await closeCurrentNetworkSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "network", blockId, profile.id)) return;
    if (onFailure) connectionFailureHandlers.current.set(`network:${blockId}`, onFailure);
    const epoch = nextEpoch(blockId);
    updateNetworkRuntime(blockId, () => ({ ...defaultNetworkRuntime, status: "connecting", connectionProgress: initialConnectionProgress(profile.jumpProfileIds?.length ?? 0) }));
    try {
      const sessionId = await connectNetworkSession({ profileId: profile.id, auth }, (event) => onNetworkSessionEvent(blockId, epoch, event));
      if (!isCurrentEpoch(blockId, epoch)) await closeSession(sessionId).catch(() => undefined);
      else updateNetworkRuntime(blockId, (runtime) => ({ ...runtime, sessionId }));
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) updateNetworkRuntime(blockId, () => ({ ...defaultNetworkRuntime, status: "failed", notice: workspaceErrorMessage(error) }));
      consumeFailureHandler(connectionFailureHandlers.current, `network:${blockId}`);
    }
  }, [closeCurrentNetworkSession, connectionFailureHandlers, connectionTargetIntents, isCurrentEpoch, nextEpoch, onNetworkSessionEvent, updateNetworkRuntime]);
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

  return { selectNetworkTarget, connectNetworkBlock, disconnectNetworkBlock, startNetworkBlockRule, stopNetworkBlockRule, acceptNetworkHostKey, rejectNetworkHostKey, closeCurrentNetworkSession };
}
