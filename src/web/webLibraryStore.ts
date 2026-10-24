import { updateWebLibrary, type WebLibrary, type WebLibraryAction } from "../lib/tauri/webLibrary";

interface Snapshot { data: WebLibrary; busy: boolean; loaded: boolean; error: string }
const empty: Snapshot = { data: { history: [], bookmarks: [] }, busy: false, loaded: false, error: "" };

/** Serialize requests, publish successful snapshots to every block of the same connection. */
export function createWebLibraryStore(transport = updateWebLibrary) {
  const snapshots = new Map<string, Snapshot>();
  const listeners = new Set<() => void>();
  let queue = Promise.resolve();
  const get = (profile: string | null) => profile ? snapshots.get(profile) ?? empty : empty;
  const publish = (profile: string, snapshot: Snapshot) => { snapshots.set(profile, snapshot); listeners.forEach(listener => listener()); };
  const execute = (profile: string, action?: WebLibraryAction) => {
    const operation = queue.then(async () => {
      publish(profile, { ...get(profile), busy: true, error: "" });
      try {
        const data = await transport(profile, action);
        publish(profile, { data, busy: false, loaded: true, error: "" });
        return true;
      } catch (error) {
        publish(profile, { ...get(profile), busy: false, loaded: true, error: String(error) });
        return false;
      }
    });
    queue = operation.then(() => undefined);
    return operation;
  };
  return {
    get, execute,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    ensure(profile: string) {
      if (get(profile).loaded || get(profile).busy) return;
      publish(profile, { ...get(profile), busy: true });
      void execute(profile);
    },
  };
}

export const webLibraryStore = createWebLibraryStore();
