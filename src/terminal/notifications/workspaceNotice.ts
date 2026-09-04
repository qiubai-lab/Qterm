export interface WorkspaceNotice {
  workspaceId: string;
  blockId: string;
  epoch: number;
  body: string;
  count: number;
  revision: number;
}

/** Transient presentation only; unread and session ownership stay with their existing stores. */
export function createWorkspaceNotice() {
  let snapshot: WorkspaceNotice | null = null;
  let revision = 0;
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach(listener => listener());
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    show: (notice: Omit<WorkspaceNotice, "count" | "revision">) => {
      snapshot = { ...notice, count: snapshot?.workspaceId === notice.workspaceId ? snapshot.count + 1 : 1, revision: ++revision };
      publish();
    },
    dismiss: (expectedRevision?: number) => {
      if (!snapshot || (expectedRevision !== undefined && snapshot.revision !== expectedRevision)) return;
      snapshot = null;
      publish();
    },
    prune: (valid: (notice: WorkspaceNotice) => boolean) => {
      if (snapshot && !valid(snapshot)) { snapshot = null; publish(); }
    },
  };
}
