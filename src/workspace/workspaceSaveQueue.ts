import type { WorkspaceDocument } from "./model";
import type { WebTabCache } from "../lib/tauri/webTabs";

/** Capture both snapshots when enqueued; never allow an older save to finish last. */
export function createWorkspaceSaveQueue(saveWorkspace: (document: WorkspaceDocument) => Promise<unknown>, saveTabs: (cache: WebTabCache) => Promise<unknown>) {
  let pending = Promise.resolve();
  return (document: WorkspaceDocument, cache: WebTabCache | null) => {
    const operation = pending.then(async () => {
      await saveWorkspace(document);
      if (cache) await saveTabs(cache);
    });
    pending = operation.catch(() => undefined);
    return operation;
  };
}
