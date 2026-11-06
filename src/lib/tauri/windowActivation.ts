import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function subscribeWindowActivation(activate: () => void): () => void {
  window.addEventListener("focus", activate);
  let disposed = false;
  let unlisten: (() => void) | undefined;
  if (isTauri()) {
    void getCurrentWindow().onFocusChanged(({ payload }) => {
      if (payload && !disposed) activate();
    }).then(stop => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(error => console.error("Could not subscribe to native window focus", error));
  }
  return () => {
    disposed = true;
    window.removeEventListener("focus", activate);
    unlisten?.();
  };
}
