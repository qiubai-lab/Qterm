import { createNotificationParser, type TerminalNotification } from "./notificationProtocol";

export function createNotificationReceiver(onAttention: (blockId: string, epoch: number, event: TerminalNotification) => void) {
  const sessions = new Map<string, { epoch: number; parser: ReturnType<typeof createNotificationParser> }>();
  return {
    feed(blockId: string, epoch: number, data: Uint8Array) {
      let session = sessions.get(blockId);
      if (!session || session.epoch !== epoch) {
        session = { epoch, parser: createNotificationParser(event => onAttention(blockId, epoch, event)) };
        sessions.set(blockId, session);
      }
      session.parser.feed(data);
    },
    prune(isCurrent: (blockId: string, epoch: number) => boolean) {
      for (const [blockId, session] of sessions) if (!isCurrent(blockId, session.epoch)) sessions.delete(blockId);
    },
    clear() { sessions.clear(); },
  };
}

export function createNotificationLimiter(now = () => performance.now()) {
  let lastSent = -Infinity;
  // Only the last delivered message per block is retained; never retain unbounded payload history.
  const lastMessages = new Map<string, { key: string; time: number }>();
  return {
    allow(blockId: string, epoch: number, event: TerminalNotification) {
      const time = now();
      const key = `${epoch}:${event.protocol}:${event.title}:${event.body}`;
      const previous = lastMessages.get(blockId);
      if (time - lastSent < 2000 || (previous?.key === key && time - previous.time < 5000)) return false;
      lastSent = time;
      lastMessages.set(blockId, { key, time });
      return true;
    },
    clear() { lastMessages.clear(); lastSent = -Infinity; },
    prune(isCurrent: (blockId: string) => boolean) { for (const blockId of lastMessages.keys()) if (!isCurrent(blockId)) lastMessages.delete(blockId); },
  };
}

/** Event-driven unread state; session identity remains owned by Workspace runtime. */
export function createNotificationInbox() {
  let snapshot: Record<string, number> = {};
  const listeners = new Set<() => void>();
  const publish = (next: Record<string, number>) => { snapshot = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    mark(blockId: string, epoch: number) { if (snapshot[blockId] !== epoch) publish({ ...snapshot, [blockId]: epoch }); },
    acknowledge(blockId: string) { if (blockId in snapshot) { const next = { ...snapshot }; delete next[blockId]; publish(next); } },
    clear() { if (Object.keys(snapshot).length) publish({}); },
    prune(valid: (blockId: string, epoch: number) => boolean) {
      const entries = Object.entries(snapshot).filter(([id, epoch]) => valid(id, epoch));
      if (entries.length !== Object.keys(snapshot).length) publish(Object.fromEntries(entries));
    },
  };
}
