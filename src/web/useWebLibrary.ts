import { useEffect, useSyncExternalStore } from "react";
import type { WebLibraryAction } from "../lib/tauri/webLibrary";
import { normalizeWebAddress } from "./webModel";
import { webLibraryStore as store } from "./webLibraryStore";

export function useWebLibrary(profile: string | null) {
  const snapshot = useSyncExternalStore(store.subscribe, () => store.get(profile));
  useEffect(() => { if (profile) store.ensure(profile); }, [profile]);
  const update = (action?: WebLibraryAction) => profile ? store.execute(profile, action) : Promise.resolve(false);
  const record = (address: string, title = "", metadata = false) => {
    try { const url = normalizeWebAddress(address); void update({ kind: metadata ? "title" : "visit", url, title }); } catch { /* Ignore non-web native navigation events. */ }
  };
  return { ...snapshot, update, record };
}
