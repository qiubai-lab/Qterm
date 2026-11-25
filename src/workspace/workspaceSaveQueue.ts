import type { WorkspaceDocument } from "./model";
import type { WebTabCache } from "../lib/tauri/webTabs";

/** Capture both snapshots when enqueued; never allow an older save to finish last. */
export function createWorkspaceSaveQueue(saveWorkspace: (document: WorkspaceDocument) => Promise<unknown>, saveTabs: (cache: WebTabCache) => Promise<unknown>) {
  let confirmed: WorkspaceDocument | null = null;
  type Snapshot = { document: WorkspaceDocument; cache: WebTabCache | null };
  let latest: Snapshot | null = null;
  let queued: Promise<void> | null = null;
  let tail = Promise.resolve();
  const enqueue = (document: WorkspaceDocument, cache: WebTabCache | null) => {
    latest = { document, cache };
    if (queued) return queued;
    queued = tail.then(async () => {
      const snapshot = latest!;
      latest = null;
      queued = null;
      await saveWorkspace(snapshot.document);
      confirmed = snapshot.document;
      if (snapshot.cache) await saveTabs(snapshot.cache);
    });
    tail = queued.catch(() => undefined);
    return queued;
  };
  return Object.assign(enqueue, {
    restored(document: WorkspaceDocument | null) { confirmed = document; },
    confirmed: (document: WorkspaceDocument) => document === confirmed,
  });
}
