import type { VaultStatus, VaultStatusChanged } from "../../lib/contracts/credentials";

type Activity = { paused: () => boolean; subscribe: (listener: () => void) => () => void };
const equal = (a: VaultStatus, b: VaultStatus) => a.initialized === b.initialized
  && a.unlocked === b.unlocked && a.legacy === b.legacy;

/** A baseline is not a lock event. Reconnects reconcile state without replaying transitions. */
export function createVaultStatusObserver(load: () => Promise<VaultStatus>, activity?: Activity) {
  const listeners = new Set<(event: VaultStatusChanged) => void>();
  let current: VaultStatus | undefined, previous: VaultStatus | undefined;
  let reason: VaultStatusChanged["reason"] = "manual";
  let serverRevision = -1, generation = 0;
  let pending: Promise<VaultStatus> | undefined;
  function flush() {
    if (!current || activity?.paused()) return;
    const old = previous;
    previous = current;
    if (old && !equal(old, current)) {
      for (const listener of listeners) listener({ ...current, reason });
    }
  }
  const stopActivity = activity?.subscribe(flush);
  async function refresh() {
    const request = generation;
    const value = await load();
    if (request === generation) {
      generation++; current = value; reason = "manual";
      flush();
    }
    return current ?? value;
  }
  return {
    read: () => {
      if (current) return Promise.resolve(current);
      if (!pending) {
        const request = refresh().finally(() => { if (pending === request) pending = undefined; });
        pending = request;
      }
      return pending;
    },
    refreshAfterMutation: refresh,
    reset: () => {
      generation++; serverRevision = -1; current = previous = undefined; pending = undefined;
    },
    beginConnection: () => {
      generation++; serverRevision = -1; current = undefined; pending = undefined;
    },
    receive: (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const next = value as Record<string, unknown>;
      if (!Number.isSafeInteger(next.revision) || Number(next.revision) <= serverRevision
        || typeof next.initialized !== "boolean" || typeof next.unlocked !== "boolean" || typeof next.legacy !== "boolean"
        || (next.reason !== "manual" && next.reason !== "timeout")) return;
      generation++; serverRevision = Number(next.revision);
      current = { initialized: next.initialized, unlocked: next.unlocked, legacy: next.legacy };
      reason = next.reason;
      flush();
    },
    subscribe: (listener: (event: VaultStatusChanged) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose: () => { stopActivity?.(); listeners.clear(); generation++; },
  };
}
