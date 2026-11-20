import { forgetTabs } from "./desktop/rememberedTabs";
import { assignServerColors } from "./serverTabColors";
import { framePort } from "./desktop/frame";
import { normalizeEndpoint, type ServerEntry } from "./model";
const activeKey = "qterm:desktop-runtime";
const entriesKey = "qterm:runtime-servers";
function valid(value: unknown): value is ServerEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as ServerEntry;
  try { return typeof entry.id === "string" && typeof entry.name === "string" && !!entry.name && normalizeEndpoint(entry.endpoint) === entry.endpoint; } catch { return false; }
}
export function readSelection(): ServerEntry | null {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try { const value: unknown = JSON.parse(sessionStorage.getItem(activeKey) ?? "null"); return valid(value) ? value : null; } catch { return null; }
}
/** Each bundled remote workbench has its own immutable service graph. */
export const selectedRuntime = framePort?.entry ?? null;
export function takeLegacySelection(): ServerEntry | null {
  const entry = readSelection();
  if (entry) {
    sessionStorage.removeItem(activeKey);
    sessionStorage.removeItem("qterm:access-key");
  }
  return entry;
}
export function listServers(): ServerEntry[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(entriesKey) ?? "[]"); return Array.isArray(value) ? assignServerColors(value.filter(valid).slice(0, 100)) : []; } catch { return []; }
}
export function saveServers(entries: ServerEntry[]) {
  const previous = listServers();
  const saved = entries.slice(0, 100);
  localStorage.setItem(entriesKey, JSON.stringify(saved));
  for (const entry of previous) {
    if (!saved.some(next => next.id === entry.id && next.endpoint === entry.endpoint)) forgetTabs(entry);
  }
}
