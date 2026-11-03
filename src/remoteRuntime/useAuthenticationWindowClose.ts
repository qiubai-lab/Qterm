import { useEffect } from "react";
import { registerCurrentWindowCloseFlush } from "../lib/tauri/window";

/** Authentication has no workspace to flush, but must handle native close after a reload. */
export function useAuthenticationWindowClose(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void registerCurrentWindowCloseFlush(async () => {}).then(unlisten => {
      if (disposed) unlisten();
      else stop = unlisten;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [enabled]);
}
