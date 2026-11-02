import type { VaultStatus, VaultStatusChanged } from "../../lib/contracts/credentials";

/** Convert browser polling snapshots into the change events expected by desktop UI. */
export function createVaultStatusObserver(load: () => Promise<VaultStatus>, activity?: { paused: () => boolean; subscribe: (listener: () => void) => () => void }) {
  const listeners = new Set<(event: VaultStatusChanged) => void>();
  let stopActivity: (() => void) | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let session: { previous?: VaultStatus; revision: number; pending: number } | undefined;

  async function refresh(afterMutation = false) {
    const current = session;
    if (activity?.paused() || !current || (!afterMutation && current.pending > 0)) return;
    const revision = ++current.revision;
    current.pending += 1;
    try {
      const next = await load();
      if (session !== current || revision !== current.revision) return;
      const previous = current.previous;
      current.previous = next;
      const changed = previous && (previous.initialized !== next.initialized
        || previous.unlocked !== next.unlocked || previous.legacy !== next.legacy);
      // The initial snapshot is a baseline, not a lock event. Explicit actions
      // still notify even when their resulting status matches the last snapshot.
      if (afterMutation || changed) {
        for (const listener of listeners) listener({ ...next, reason: "manual" });
      }
    } finally {
      current.pending -= 1;
    }
  }

  function subscribe(listener: (event: VaultStatusChanged) => void) {
    listeners.add(listener);
    if (!session) {
      session = { revision: 0, pending: 0 };
      const sample = () => { void refresh().catch(() => undefined); };
      const sync = () => {
        clearInterval(poll);
        if (session) session.revision += 1;
        if (activity?.paused()) return;
        void refresh(true).catch(() => undefined);
        poll = setInterval(sample, 2000);
      };
      stopActivity = activity?.subscribe(sync);
      if (!activity?.paused()) { sample(); poll = setInterval(sample, 2000); }
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      stopActivity?.(); stopActivity = undefined;
      clearInterval(poll);
      poll = undefined;
      session = undefined;
    };
  }

  return { subscribe, refreshAfterMutation: () => refresh(true) };
}
