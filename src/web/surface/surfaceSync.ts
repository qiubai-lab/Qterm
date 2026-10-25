import { captureWeb, syncWeb, type WebBounds } from "../../lib/tauri/web";
import { createSurfaceCover } from "./surfaceCover";

export interface SurfaceIntent { bounds: WebBounds; cover: boolean; revision: number; url: string; snapshotReady?: boolean }

/** Serial native writes, independent cancellable capture, latest-intent wins. */
export function createSurfaceSync(id: string, element: HTMLElement, onError: (reason: string) => void) {
  const cover = createSurfaceCover(element);
  let desired: SurfaceIntent | null = null;
  let disposed = false, syncing = false, ready = false, capturing = false;
  let epoch = 0, capturedEpoch = -1, coverKey = "", committed = "";

  const current = (token: number) => !disposed && token === epoch && Boolean(desired?.cover && desired.bounds.visible);
  async function capture(token: number) {
    capturing = true;
    try {
      if (desired?.snapshotReady === false) throw new Error("网页正在加载");
      const snapshot = await captureWeb(id);
      if (!current(token)) return;
      if (snapshot.url !== desired?.url) throw new Error("网页已跳转");
      const shown = await cover.show(snapshot, () => current(token));
      if (current(token)) ready = shown;
    } catch {
      if (current(token)) {
        const shown = await cover.fallback(() => current(token));
        if (current(token)) ready = shown;
      }
    } finally {
      if (current(token)) capturedEpoch = token;
      capturing = false; pump();
    }
  }

  function pump() {
    if (disposed || syncing || !desired) return;
    const intent = desired;
    const token = epoch;
    const bounds: WebBounds = { ...intent.bounds, inputBlocked: intent.cover, covered: intent.cover && ready };
    const key = JSON.stringify([bounds, intent.revision, window.devicePixelRatio, token]);
    if (key === committed) {
      if (intent.cover && capturedEpoch !== token && !capturing) void capture(token);
      return;
    }
    syncing = true;
    void syncWeb(id, bounds).then(() => {
      committed = key;
      if (!disposed && token === epoch) {
        if (intent.cover && capturedEpoch !== token && !capturing) void capture(token);
        else if (!intent.cover) cover.clear();
      }
    }, error => { if (!disposed) onError(String(error)); }).finally(() => {
      syncing = false;
      // New intent is sent immediately, even when capture from an old intent is pending.
      if (!disposed && (desired !== intent || ready !== bounds.covered)) pump();
    });
  }

  return {
    update(intent: SurfaceIntent) {
      desired = intent;
      const key = intent.cover && intent.bounds.visible
        ? JSON.stringify([intent.revision, intent.url, intent.snapshotReady, intent.bounds.width, intent.bounds.height, window.devicePixelRatio]) : "";
      if (key !== coverKey) {
        coverKey = key; epoch++;
        if (!key) ready = false;
        else if (ready) {
          // Keep the native surface covered, but never retain pixels from an
          // obsolete document or size while its replacement is being captured.
          const token = epoch;
          void cover.fallback(() => current(token));
        }
        // Lock, workspace/tab removal and disconnect discard all preview pixels immediately.
        if (!intent.bounds.visible) cover.clear();
      }
      pump();
    },
    dispose() { disposed = true; epoch++; cover.clear(); },
  };
}
