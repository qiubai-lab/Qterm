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
/** Immutable for this page lifetime. Switching always creates a new service graph. */
export const selectedRuntime = readSelection();
export function selectRuntime(entry: ServerEntry | null) {
  if (entry) sessionStorage.setItem(activeKey, JSON.stringify(entry)); else sessionStorage.removeItem(activeKey);
  sessionStorage.removeItem("qterm:access-key");
}
export function listServers(): ServerEntry[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(entriesKey) ?? "[]"); return Array.isArray(value) ? value.filter(valid).slice(0, 100) : []; } catch { return []; }
}
export function saveServers(entries: ServerEntry[]) { localStorage.setItem(entriesKey, JSON.stringify(entries.slice(0, 100))); }
