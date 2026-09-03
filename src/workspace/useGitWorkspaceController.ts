import { useCallback, type Dispatch } from "react";

import { connectGitSession } from "../lib/tauri/git";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { acceptHostKey, closeSession, rejectHostKey, type SessionAuth, type SessionEvent } from "../lib/tauri/sessions";
import { completeConnectionProgress, connectionProgressFromRouteEvent, failConnectionProgress, initialConnectionProgress } from "./connectionProgress";
import type { GitTarget } from "./model";
import type { WorkspaceAction } from "./reducer";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { connectionIntentAllows, connectionIntentKey, consumeFailureHandler, defaultGitRuntime, nodeLabel, routeFailureNotice, workspaceErrorMessage, type GitRuntime } from "./workspaceRuntime";

export function canReuseGitRemoteSession(currentTarget: GitTarget | undefined, target: GitTarget, runtime: GitRuntime | undefined, preparedProfileId: string | null = null): boolean {
  return target.type === "remote"
    && ((currentTarget?.type === "remote" && target.profileId === currentTarget.profileId) || target.profileId === preparedProfileId)
    && runtime?.status === "connected"
    && Boolean(runtime.sessionId);
}

export function stageGitRemoteTargetIntent(intents: Map<string, string | null>, blockId: string, profileId: string) {
  intents.set(connectionIntentKey("git", blockId), profileId);
}

export function restoreGitTargetIntent(intents: Map<string, string | null>, blockId: string, target: GitTarget): boolean {
  const key = connectionIntentKey("git", blockId);
  const restoredProfileId = target.type === "remote" ? target.profileId : null;
  const changed = intents.has(key) && intents.get(key) !== restoredProfileId;
  intents.set(key, restoredProfileId);
  return changed;
}

export function useGitWorkspaceController(state: WorkspaceRuntimeState, dispatch: Dispatch<WorkspaceAction>) {
  const { gitRuntimes, gitRuntimesRef, connectionTargetIntents, connectionFailureHandlers, updateGitRuntime, nextEpoch, isCurrentEpoch } = state;

  const onGitSessionEvent = useCallback((blockId: string, epoch: number, event: SessionEvent) => {
    if (!isCurrentEpoch(blockId, epoch)) return;
    if (event.type === "stateChanged") {
      updateGitRuntime(blockId, (runtime) => ({
        ...runtime,
        status: event.state,
        sessionId: event.state === "closed" || event.state === "failed" ? null : runtime.sessionId,
        notice: event.state === "connected" ? "" : runtime.notice,
        stale: event.state === "connected" ? false : event.state === "closed" || event.state === "failed" ? true : runtime.stale,
        connectionProgress: event.state === "connected"
          ? completeConnectionProgress(runtime.connectionProgress)
          : event.state === "failed" ? failConnectionProgress(runtime.connectionProgress, null, "连接失败")
            : event.state === "closed" ? null : runtime.connectionProgress,
      }));
      if (event.state === "connected") connectionFailureHandlers.current.delete(`git:${blockId}`);
    } else if (event.type === "routeProgress") {
      updateGitRuntime(blockId, (runtime) => ({ ...runtime, notice: "", connectionProgress: connectionProgressFromRouteEvent(event, runtime.connectionProgress) }));
    } else if (event.type === "hostKeyConfirmationRequired") {
      updateGitRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: event }));
    } else if (event.type === "hostKeyChanged") {
      updateGitRuntime(blockId, (runtime) => ({ ...runtime, stale: true, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, "主机密钥已变化"), notice: `${nodeLabel(event.node)}主机密钥已变化：${event.presentedFingerprint}` }));
    } else {
      updateGitRuntime(blockId, (runtime) => ({ ...runtime, stale: true, connectionProgress: failConnectionProgress(runtime.connectionProgress, event.node, event.message), notice: routeFailureNotice(event) }));
      if (event.node?.role === "target" && event.stage === "authenticate") consumeFailureHandler(connectionFailureHandlers.current, `git:${blockId}`);
    }
  }, [connectionFailureHandlers, isCurrentEpoch, updateGitRuntime]);

  const closeCurrentGitSession = useCallback(async (blockId: string) => {
    const runtime = gitRuntimesRef.current[blockId];
    nextEpoch(blockId);
    connectionFailureHandlers.current.delete(`git:${blockId}`);
    if (runtime?.sessionId) await closeSession(runtime.sessionId).catch(() => undefined);
    updateGitRuntime(blockId, (current) => ({ ...defaultGitRuntime, stale: current.stale || Boolean(runtime?.sessionId) }));
  }, [connectionFailureHandlers, gitRuntimesRef, nextEpoch, updateGitRuntime]);
  const disconnectGitBlock = useCallback(async (blockId: string) => closeCurrentGitSession(blockId), [closeCurrentGitSession]);
  const stageGitRemoteTarget = useCallback((blockId: string, profileId: string) => {
    stageGitRemoteTargetIntent(connectionTargetIntents.current, blockId, profileId);
  }, [connectionTargetIntents]);
  const cancelStagedGitTarget = useCallback(async (blockId: string, target: GitTarget) => {
    if (restoreGitTargetIntent(connectionTargetIntents.current, blockId, target)) await closeCurrentGitSession(blockId);
  }, [closeCurrentGitSession, connectionTargetIntents]);
  const selectGitTarget = useCallback(async (workspaceId: string, blockId: string, target: GitTarget, currentTarget?: GitTarget) => {
    const profileId = target.type === "remote" ? target.profileId : null;
    const preparedProfileId = connectionTargetIntents.current.get(connectionIntentKey("git", blockId)) ?? null;
    connectionTargetIntents.current.set(connectionIntentKey("git", blockId), profileId);
    dispatch({ type: "recordRecentProfile", profileId });
    const runtime = gitRuntimesRef.current[blockId];
    const canReuseRemoteSession = canReuseGitRemoteSession(currentTarget, target, runtime, preparedProfileId);
    if (canReuseRemoteSession) {
      dispatch({ type: "setGitTarget", workspaceId, blockId, target });
      updateGitRuntime(blockId, (current) => ({ ...current, stale: false, notice: "" }));
      return;
    }
    await closeCurrentGitSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "git", blockId, profileId)) return;
    dispatch({ type: "setGitTarget", workspaceId, blockId, target });
    updateGitRuntime(blockId, () => ({ ...defaultGitRuntime, stale: false }));
  }, [closeCurrentGitSession, connectionTargetIntents, dispatch, gitRuntimesRef, updateGitRuntime]);
  const connectGitBlock = useCallback(async (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => {
    if (!connectionIntentAllows(connectionTargetIntents.current, "git", blockId, profile.id)) return;
    await closeCurrentGitSession(blockId);
    if (!connectionIntentAllows(connectionTargetIntents.current, "git", blockId, profile.id)) return;
    if (onFailure) connectionFailureHandlers.current.set(`git:${blockId}`, onFailure);
    const epoch = nextEpoch(blockId);
    updateGitRuntime(blockId, () => ({ ...defaultGitRuntime, status: "connecting", connectionProgress: initialConnectionProgress(profile.jumpProfileIds?.length ?? 0) }));
    try {
      const sessionId = await connectGitSession({ profileId: profile.id, auth }, (event) => onGitSessionEvent(blockId, epoch, event));
      if (!isCurrentEpoch(blockId, epoch)) await closeSession(sessionId).catch(() => undefined);
      else updateGitRuntime(blockId, (runtime) => ({ ...runtime, sessionId }));
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) updateGitRuntime(blockId, () => ({ ...defaultGitRuntime, status: "failed", stale: true, notice: workspaceErrorMessage(error) }));
      consumeFailureHandler(connectionFailureHandlers.current, `git:${blockId}`);
    }
  }, [closeCurrentGitSession, connectionFailureHandlers, connectionTargetIntents, isCurrentEpoch, nextEpoch, onGitSessionEvent, updateGitRuntime]);
  const acceptGitHostKey = useCallback(async (blockId: string) => {
    const sessionId = gitRuntimes[blockId]?.sessionId;
    if (sessionId) await acceptHostKey(sessionId);
    updateGitRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: null }));
  }, [gitRuntimes, updateGitRuntime]);
  const rejectGitHostKey = useCallback(async (blockId: string) => {
    const sessionId = gitRuntimes[blockId]?.sessionId;
    if (sessionId) await rejectHostKey(sessionId);
    updateGitRuntime(blockId, (runtime) => ({ ...runtime, hostKeyPrompt: null }));
  }, [gitRuntimes, updateGitRuntime]);

  return { selectGitTarget, stageGitRemoteTarget, cancelStagedGitTarget, connectGitBlock, disconnectGitBlock, acceptGitHostKey, rejectGitHostKey, closeCurrentGitSession };
}
