import type { SavedWebBlockTabs, WebTabCache } from "../lib/tauri/webTabs";
import type { LayoutNode, WorkspaceDocument } from "../workspace/model";
import { normalizeWebAddress } from "./webModel";

function targets(document: WorkspaceDocument) {
  const result = new Map<string, string | null>();
  const visit = (node: LayoutNode) => {
    if (node.type === "split") { visit(node.first); visit(node.second); }
    else if (node.type === "web") result.set(node.blockId, node.profileId);
  };
  document.workspaces.forEach(workspace => visit(workspace.layout));
  return result;
}

/** Recovery projections only. Live page state and popup ownership remain in WebTabs. */
export function createWebTabSessionStore() {
  const entries = new Map<string, SavedWebBlockTabs>();
  const bindings = new Map<string, { profileId: string | null; token: object }>();
  const listeners = new Set<() => void>();
  let writable = false;
  const publish = () => listeners.forEach(listener => listener());
  const reconcile = (document: WorkspaceDocument) => {
    const live = targets(document);
    let changed = false;
    for (const [id, entry] of entries) {
      if (!live.has(id) || live.get(id) !== entry.profileId) { entries.delete(id); changed = true; }
    }
    for (const [id, binding] of bindings) {
      if (!live.has(id) || live.get(id) !== binding.profileId) bindings.delete(id);
    }
    if (changed) publish();
  };
  return {
    restore(cache: WebTabCache, document: WorkspaceDocument) {
      entries.clear();
      cache.blocks.forEach(block => entries.set(block.blockId, block));
      writable = true;
      reconcile(document);
    },
    reconcile,
    snapshot(): WebTabCache | null { return writable ? { blocks: [...entries.values()] } : null; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    bind(blockId: string, profileId: string | null) {
      const entry = entries.get(blockId);
      const token = {};
      return {
        initial: entry?.profileId === profileId ? entry : undefined,
        activate() { bindings.set(blockId, { profileId, token }); },
        update(value: Pick<SavedWebBlockTabs, "tabs" | "selectedTabId">) {
          if (!writable || bindings.get(blockId)?.token !== token) return;
          const next: SavedWebBlockTabs = { blockId, profileId, selectedTabId: value.selectedTabId, tabs: value.tabs.map(tab => {
            let address = "";
            try { if (tab.address) address = normalizeWebAddress(tab.address); } catch { /* Non-restorable popup documents become blank tabs. */ }
            return { id: tab.id, address, title: [...tab.title].filter(char => char.charCodeAt(0) >= 32 && (char.charCodeAt(0) < 127 || char.charCodeAt(0) > 159)).slice(0, 500).join("") };
          }) };
          if (JSON.stringify(entries.get(blockId)) === JSON.stringify(next)) return;
          entries.set(blockId, next); publish();
        },
      };
    },
  };
}

export type WebTabSessionStore = ReturnType<typeof createWebTabSessionStore>;
export type WebTabSessionBinding = ReturnType<WebTabSessionStore["bind"]>;
