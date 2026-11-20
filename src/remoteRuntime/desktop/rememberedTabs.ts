import type { ServerEntry } from "../model";
import { MAX_WORKSPACES } from "../../workspace/workspaceLimits";
import type { EnvironmentTabs } from "./frame";

const storageKey = (entry: ServerEntry) => "qterm:server-tab-titles:" + JSON.stringify([entry.id, entry.endpoint]);

/** Only titles and navigation IDs are available before authentication. */
export function readRememberedTabs(entry: ServerEntry): EnvironmentTabs | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(entry)) ?? "null");
    if (!Array.isArray(value?.items) || !value.items.length || value.items.length > MAX_WORKSPACES) return;
    const items: { id: string; name: string }[] = [];
    for (const item of value.items) {
      if (typeof item?.id !== "string" || typeof item.name !== "string" || !item.id) return;
      items.push({ id: item.id, name: item.name });
    }
    const activeId = items.find(item => item.id === value.activeId)?.id ?? items[0].id;
    return { activeId, items, enabled: false };
  } catch { return; }
}

export function rememberTabs(entry: ServerEntry, tabs: EnvironmentTabs) {
  const value = JSON.stringify({ activeId: tabs.activeId, items: tabs.items.map(({ id, name }) => ({ id, name })) });
  try {
    const key = storageKey(entry);
    if (localStorage.getItem(key) !== value) localStorage.setItem(key, value);
  } catch { /* The live tab strip still works if local storage is unavailable. */ }
}

export function forgetTabs(entry: ServerEntry) {
  try { localStorage.removeItem(storageKey(entry)); } catch { /* Storage may be unavailable. */ }
}
