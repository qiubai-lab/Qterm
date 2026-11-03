import { useCallback } from "react";
import { isServer } from "../lib/runtime/environment";
import type { ConnectionProfile } from "@qterm/services/profiles";
import { attachRetainedSession, type RetainedSession } from "@qterm/services/runtimeSessions";
import { closeSession, connectSession, type SessionAuth, type SessionEvent } from "@qterm/services/sessions";
import { resolveRetainedSession } from "./retainedSessionRecovery";
import { initialConnectionProgress } from "./connectionProgress";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { connectionIntentAllows, consumeFailureHandler, defaultRuntime, epochKey, terminalFailureKey, workspaceErrorMessage } from "./workspaceRuntime";

type ConnectionState = Pick<WorkspaceRuntimeState,
  "connectionTargetIntents" | "connectionFailureHandlers" | "finishedEpochs" | "startingLocal" |
  "runtimesRef" | "nextEpoch" | "isCurrentEpoch" | "updateRuntime" | "terminalSizeReaders" | "pendingInitialDirectories">;
interface TerminalIO {
  closeCurrentSession: (blockId: string) => Promise<void>;
  clearBlockBuffer: (blockId: string, reset?: boolean) => void;
  terminalRestoreDirectory: (blockId: string, profileId: string | null) => string | undefined;
  onSessionEvent: (blockId: string, epoch: number, event: SessionEvent) => void;
  deliverTerminalOutput: (blockId: string, epoch: number, data: Uint8Array, consumed?: () => void) => void;
}

/** New connections and retained attachments share the terminal's epoch and in-flight reservation. */
export function useRemoteTerminalConnection(state: ConnectionState, io: TerminalIO) {
  const { connectionTargetIntents, connectionFailureHandlers, finishedEpochs, startingLocal,
    runtimesRef, nextEpoch, isCurrentEpoch, updateRuntime, terminalSizeReaders, pendingInitialDirectories } = state;
  const { closeCurrentSession, clearBlockBuffer, terminalRestoreDirectory, onSessionEvent, deliverTerminalOutput } = io;

  const attach = useCallback(async (session: RetainedSession, blockId: string, epoch: number) => {
    const id = await attachRetainedSession(session,
      event => onSessionEvent(blockId, epoch, event),
      (data, consumed) => { if (isCurrentEpoch(blockId, epoch)) deliverTerminalOutput(blockId, epoch, data, consumed); else consumed?.(); });
    if (isCurrentEpoch(blockId, epoch) && !finishedEpochs.current.has(epochKey(blockId, epoch))) {
      updateRuntime(blockId, runtime => ({ ...runtime, sessionId: id }));
    }
  }, [deliverTerminalOutput, finishedEpochs, isCurrentEpoch, onSessionEvent, updateRuntime]);

  const restoreTerminalBlock = useCallback(async (session: RetainedSession) => {
    const blockId = session.runtimeKey;
    if (!blockId || !connectionIntentAllows(connectionTargetIntents.current, "terminal", blockId, session.profileId)) return;
    if (runtimesRef.current[blockId]?.sessionId || startingLocal.current.has(blockId)) return;
    const epoch = nextEpoch(blockId);
    startingLocal.current.set(blockId, epoch);
    updateRuntime(blockId, () => ({ ...defaultRuntime, kind: "ssh", status: "connecting" }));
    try {
      await attach(session, blockId, epoch);
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) updateRuntime(blockId, runtime => ({ ...runtime, status: "failed", notice: workspaceErrorMessage(error) }));
    } finally {
      if (startingLocal.current.get(blockId) === epoch) startingLocal.current.delete(blockId);
    }
  }, [attach, connectionTargetIntents, isCurrentEpoch, nextEpoch, runtimesRef, startingLocal, updateRuntime]);

  const connectBlock = useCallback(async (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => {
    if (!connectionIntentAllows(connectionTargetIntents.current, "terminal", blockId, profile.id)) return;
    if (isServer) {
      const runtime = runtimesRef.current[blockId];
      if (startingLocal.current.has(blockId) || (runtime?.sessionId && runtime.status !== "failed" && runtime.status !== "closed")) return;
    } else {
      await closeCurrentSession(blockId);
      if (!connectionIntentAllows(connectionTargetIntents.current, "terminal", blockId, profile.id)) return;
    }
    const epoch = nextEpoch(blockId);
    if (isServer) startingLocal.current.set(blockId, epoch);
    const failureKey = terminalFailureKey(blockId, epoch);
    const key = epochKey(blockId, epoch);
    finishedEpochs.current.delete(key);
    updateRuntime(blockId, () => ({ ...defaultRuntime, kind: "ssh", status: "connecting" }));
    try {
      if (isServer) {
        const recovery = await resolveRetainedSession(blockId, "terminal", profile.id, () => isCurrentEpoch(blockId, epoch));
        if (recovery.action === "cancel") return;
        if (recovery.action === "attach") { await attach(recovery.session, blockId, epoch); return; }
      }
      clearBlockBuffer(blockId, true);
      if (onFailure) connectionFailureHandlers.current.set(failureKey, onFailure);
      const terminalSize = terminalSizeReaders.current.get(blockId)?.() ?? { columns: 80, rows: 24 };
      updateRuntime(blockId, () => ({ ...defaultRuntime, kind: "ssh", status: "connecting", connectionProgress: initialConnectionProgress(profile.jumpProfileIds?.length ?? 0) }));
      const sessionId = await connectSession(
        { profileId: profile.id, auth, ...(isServer ? { runtimeKey: blockId } : {}), terminalSize, initialDirectory: pendingInitialDirectories.current.get(blockId) ?? terminalRestoreDirectory(blockId, profile.id) },
        event => onSessionEvent(blockId, epoch, event),
        (data, consumed) => { if (isCurrentEpoch(blockId, epoch)) deliverTerminalOutput(blockId, epoch, data, consumed); else consumed?.(); },
      );
      if (!isCurrentEpoch(blockId, epoch)) await closeSession(sessionId).catch(() => undefined);
      else if (!finishedEpochs.current.has(key)) updateRuntime(blockId, runtime => ({ ...runtime, sessionId, kind: "ssh" }));
    } catch (error) {
      if (isCurrentEpoch(blockId, epoch)) {
        updateRuntime(blockId, () => ({ ...defaultRuntime, kind: "ssh", status: "failed", notice: workspaceErrorMessage(error) }));
        consumeFailureHandler(connectionFailureHandlers.current, failureKey);
      }
    } finally {
      if (startingLocal.current.get(blockId) === epoch) startingLocal.current.delete(blockId);
    }
  }, [attach, clearBlockBuffer, closeCurrentSession, connectionFailureHandlers, connectionTargetIntents, deliverTerminalOutput, finishedEpochs, isCurrentEpoch, nextEpoch, onSessionEvent, pendingInitialDirectories, runtimesRef, startingLocal, terminalRestoreDirectory, terminalSizeReaders, updateRuntime]);

  return { connectBlock, restoreTerminalBlock };
}
