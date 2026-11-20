import type { RecoveryLookup, RetainedSession } from "../lib/tauri/runtimeSessions";
import { dataLease } from "./dataAccess";
import { api } from "./http";

type Snapshot = Promise<RetainedSession[]>;
/** A short-lived restore batch in this server document. Explicit management reads always ask the server. */
export function createSessionInventory(read: () => Snapshot) {
  let lease: AbortSignal | undefined;
  let inflight: Snapshot | undefined;
  let batch: { snapshot: Snapshot; expires: number; changed: Set<string> } | undefined;

  function changed(blockId?: string) {
    inflight = undefined;
    if (blockId) batch?.changed.add(blockId);
    else batch = undefined;
  }

  async function list(lookup?: RecoveryLookup) {
    const access = dataLease();
    if (lease !== access.signal) {
      changed();
      lease = access.signal;
    }
    const keys = lookup && ("blockId" in lookup ? [lookup.blockId] : lookup.blockIds);
    const reusable = batch && Date.now() < batch.expires ? batch : undefined;
    if (keys && reusable && keys.every(key => !reusable.changed.has(key))) {
      const sessions = await reusable.snapshot;
      access.check();
      return sessions;
    }
    const snapshot = inflight ??= read();
    if (keys && !reusable) batch = { snapshot, expires: Date.now() + 5000, changed: new Set() };
    try {
      const sessions = await snapshot;
      access.check();
      return sessions;
    } catch (error) {
      if (batch?.snapshot === snapshot) batch = undefined;
      throw error;
    } finally {
      if (inflight === snapshot) inflight = undefined;
    }
  }
  return { list, changed };
}

export const sessionInventory = createSessionInventory(() => api("/runtime/sessions"));
