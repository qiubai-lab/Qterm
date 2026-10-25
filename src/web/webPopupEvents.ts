import { listenWebPopups, listenWebWindowClose, rejectWebPopup, type WebPopupRequest } from "../lib/tauri/webPopups";

export interface WebPopupOptions {
  initial?: WebPopupRequest;
  onRequest?: (request: WebPopupRequest) => void;
  onClose?: () => void;
}

/** One subscription belongs to one native guest generation, including async setup/teardown. */
export function watchWebPopups(id: string, callbacks: () => WebPopupOptions, onError: (message: string) => void) {
  let disposed = false;
  const seen = new Set<string>();
  const disposers: (() => void)[] = [];
  const dispose = () => { disposed = true; for (const unlisten of disposers.splice(0)) unlisten(); };
  const track = (unlisten: () => void) => { if (disposed) unlisten(); else disposers.push(unlisten); };
  const label = `web-${id}`;
  const listeners = Promise.all([
    listenWebPopups(event => {
      if (event.label !== label) return;
      if (disposed) { if (event.requestId) void rejectWebPopup(event.requestId).catch(() => undefined); return; }
      if (event.message) { onError(event.message); return; }
      if (!event.requestId || seen.has(event.requestId)) return;
      seen.add(event.requestId);
      if (seen.size > 128) seen.delete(seen.values().next().value!);
      try {
        const open = callbacks().onRequest;
        if (!open) throw new Error("无法创建新标签页");
        open({ label, requestId: event.requestId, url: event.url });
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
        void rejectWebPopup(event.requestId).catch(() => undefined);
      }
    }).then(track),
    listenWebWindowClose(source => { if (!disposed && source === label) callbacks().onClose?.(); })
      .then(track),
  ]);
  return {
    ready: listeners.then(() => undefined).catch(error => { dispose(); throw error; }),
    dispose,
  };
}
