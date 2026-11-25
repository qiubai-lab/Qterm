import { environmentForeground } from "../../remoteRuntime/desktop/foreground";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function subscribeWindowActivation(activate: () => void): () => void {
  const focus = () => { if (environmentForeground()) activate(); };
  window.addEventListener("focus", focus);
  let disposed = false;
  let unlisten: (() => void) | undefined;
  if (isTauri()) {
    void getCurrentWindow().onFocusChanged(({ payload }) => {
      if (payload && !disposed) focus();
    }).then(stop => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(error => console.error("Could not subscribe to native window focus", error));
  }
  return () => {
    disposed = true;
    window.removeEventListener("focus", focus);
    unlisten?.();
  };
}
