import { useEffect, useLayoutEffect, useRef } from "react";
import { listenWebFocus } from "../lib/tauri/web";

/** Native guest clicks never bubble into the host DOM's outside-pointer handlers. */
export function useNativeWebDismiss(open: boolean, dismiss: () => void) {
  const latest = useRef(dismiss);
  useLayoutEffect(() => { latest.current = dismiss; }, [dismiss]);
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenWebFocus(() => { if (!disposed) latest.current(); })
      .then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, [open]);
}
