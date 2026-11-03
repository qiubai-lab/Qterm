import { useCallback, useRef, type RefObject } from "react";
import { isServer } from "../lib/runtime/environment";
import { attachRetainedSession, type RetainedSession } from "@qterm/services/runtimeSessions";
import type { ConnectionProfile } from "@qterm/services/profiles";
import { closeSession, type SessionAuth, type SessionConnectInput, type SessionEvent } from "@qterm/services/sessions";
import { initialConnectionProgress, type ConnectionRouteProgressState } from "./connectionProgress";
import { resolveRetainedSession } from "./retainedSessionRecovery";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { connectionIntentAllows, consumeFailureHandler, epochKey, workspaceErrorMessage } from "./workspaceRuntime";

type State = Pick<WorkspaceRuntimeState, "connectionTargetIntents" | "connectionFailureHandlers" | "finishedEpochs" | "nextEpoch" | "isCurrentEpoch">;
interface Runtime {
  sessionId: string | null;
  status: string;
  notice: string;
  connectionProgress: ConnectionRouteProgressState | null;
}
interface Service<R extends Runtime> {
  kind: "files" | "git" | "network";
  runtimes: RefObject<Record<string, R>>;
  update: (blockId: string, update: (runtime: R) => R) => void;
  initial: (session?: RetainedSession) => R;
  onEvent: (blockId: string, epoch: number, event: SessionEvent) => void;
  close: (blockId: string) => Promise<void>;
  open: (input: SessionConnectInput, onEvent: (event: SessionEvent) => void) => Promise<string>;
}

/** Files/Git/Network own their event state; this hook owns exclusive connect/attach sequencing. */
export function useRemoteServiceConnection<R extends Runtime>(state: State, service: Service<R>) {
  const { connectionTargetIntents, connectionFailureHandlers, finishedEpochs, nextEpoch, isCurrentEpoch } = state;
  const { kind, runtimes, update, initial, onEvent, close, open } = service;
  const pending = useRef(new Map<string, number>());
  const busy = useCallback((blockId: string) => {
    const epoch = pending.current.get(blockId);
    return epoch !== undefined && isCurrentEpoch(blockId, epoch);
  }, [isCurrentEpoch]);

  const attach = useCallback(async (session: RetainedSession, blockId: string, epoch: number) => {
    update(blockId, () => ({ ...initial(session), status: "connecting" }));
    const sessionId = await attachRetainedSession(session, event => onEvent(blockId, epoch, event), (_data, consumed) => consumed?.());
    if (isCurrentEpoch(blockId, epoch) && !finishedEpochs.current.has(epochKey(blockId, epoch))) {
      update(blockId, runtime => ({ ...runtime, sessionId }));
    }
  }, [finishedEpochs, initial, isCurrentEpoch, onEvent, update]);

  const restore = useCallback(async (session: RetainedSession) => {
    const blockId = session.runtimeKey;
    if (!blockId || session.kind !== kind || !connectionIntentAllows(connectionTargetIntents.current, kind, blockId, session.profileId)) return;
    if (runtimes.current[blockId]?.sessionId || busy(blockId)) return;
    const epoch = nextEpoch(blockId);
    pending.current.set(blockId, epoch);
    try {
      await attach(session, blockId, epoch);
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) update(blockId, () => ({ ...initial(), status: "failed", notice: workspaceErrorMessage(error) }));
    } finally {
      if (pending.current.get(blockId) === epoch) pending.current.delete(blockId);
    }
  }, [attach, busy, connectionTargetIntents, initial, isCurrentEpoch, kind, nextEpoch, runtimes, update]);

  const connect = useCallback(async (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => {
    if (!connectionIntentAllows(connectionTargetIntents.current, kind, blockId, profile.id)) return;
    if (isServer) {
      const runtime = runtimes.current[blockId];
      if (busy(blockId) || (runtime?.sessionId && runtime.status !== "closed" && runtime.status !== "failed")) return;
    } else {
      await close(blockId);
      if (!connectionIntentAllows(connectionTargetIntents.current, kind, blockId, profile.id)) return;
    }
    const epoch = nextEpoch(blockId);
    pending.current.set(blockId, epoch);
    const failureKey = `${kind}:${blockId}`;
    update(blockId, () => ({ ...initial(), status: "connecting" }));
    try {
      if (isServer) {
        const recovery = await resolveRetainedSession(blockId, kind, profile.id, () => isCurrentEpoch(blockId, epoch));
        if (recovery.action === "cancel") return;
        if (recovery.action === "attach") { await attach(recovery.session, blockId, epoch); return; }
      }
      if (onFailure) connectionFailureHandlers.current.set(failureKey, onFailure);
      update(blockId, () => ({ ...initial(), status: "connecting", connectionProgress: initialConnectionProgress(profile.jumpProfileIds?.length ?? 0) }));
      const sessionId = await open({ profileId: profile.id, auth, ...(isServer ? { runtimeKey: blockId } : {}) }, event => onEvent(blockId, epoch, event));
      if (!isCurrentEpoch(blockId, epoch)) await closeSession(sessionId).catch(() => undefined);
      else if (!finishedEpochs.current.has(epochKey(blockId, epoch))) update(blockId, runtime => ({ ...runtime, sessionId }));
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) {
        update(blockId, () => ({ ...initial(), status: "failed", notice: workspaceErrorMessage(error) }));
        consumeFailureHandler(connectionFailureHandlers.current, failureKey);
      }
    } finally {
      if (pending.current.get(blockId) === epoch) pending.current.delete(blockId);
    }
  }, [attach, busy, close, connectionFailureHandlers, connectionTargetIntents, finishedEpochs, initial, isCurrentEpoch, kind, nextEpoch, onEvent, open, runtimes, update]);

  return { connect, restore };
}
