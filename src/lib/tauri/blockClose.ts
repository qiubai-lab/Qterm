import { getCurrentWindow } from "@tauri-apps/api/window";

export function hasNativeBlockClose(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Keep the native subscription stable while the caller supplies current state. */
export const subscribeNativeBlockClose = (receive: (source: string | null) => void) => subscribeNativeClose("qterm-close-block", receive);
export const subscribeNativeWebTabClose = (receive: (source: string | null) => void) => subscribeNativeClose("qterm-close-web-tab", receive);

function subscribeNativeClose(name: "qterm-close-block" | "qterm-close-web-tab", receive: (source: string | null) => void): () => void {
  if (!hasNativeBlockClose()) return () => undefined;
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void getCurrentWindow().listen<string | null>(name, event => {
    if (!disposed && (event.payload === null || typeof event.payload === "string")) receive(event.payload);
  }).then(stop => {
    if (disposed) stop();
    else unlisten = stop;
  }).catch(error => console.error("Could not register block close shortcut", error));
  return () => { disposed = true; unlisten?.(); };
}
