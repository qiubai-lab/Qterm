import type { DesktopEnvironments } from "./environments";
import { listServers, takeLegacySelection } from "../selection";

const storageKey = "qterm:window-environments";

/** Reload can reattach to the native connections still owned by this window. */
export function restoreWindowSession(host: DesktopEnvironments) {
  const entries = listServers();
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (Array.isArray(saved?.members)) {
      for (const item of saved.members) {
        const entry = entries.find(entry => entry.id === item?.id && entry.endpoint === item.endpoint);
        if (entry && typeof item.runtimeId === "string") void host.connect(entry, item.runtimeId);
      }
      if (typeof saved.active === "string") host.focus(saved.active);
      return;
    }
  } catch { /* A fresh window still has its local workspace and server list. */ }
  const legacy = takeLegacySelection();
  if (legacy) void host.connect(entries.find(entry => entry.id === legacy.id && entry.endpoint === legacy.endpoint) ?? legacy);
}
export function rememberWindowSession(host: DesktopEnvironments) {
  let last = "";
  const persist = () => {
    const { environments, active } = host.snapshot();
    const members = environments.filter(env => env.entry).map(env => ({ id: env.entry!.id, endpoint: env.entry!.endpoint, runtimeId: env.runtimeId }));
    const value = JSON.stringify({ active, members });
    if (value === last) return;
    try { sessionStorage.setItem(storageKey, value); last = value; } catch { /* Storage is optional. */ }
  };
  persist();
  return host.subscribe(persist);
}
