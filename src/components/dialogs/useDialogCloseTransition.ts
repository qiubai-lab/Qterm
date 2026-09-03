import { useCallback, useEffect, useRef, useState } from "react";

const dialogExitDurationMs = 130;

export function useDialogCloseTransition() {
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const closeWithTransition = useCallback((complete: () => void) => {
    if (closing || closeTimer.current !== null) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      complete();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      complete();
    }, dialogExitDurationMs);
  }, [closing]);

  return { closing, closeWithTransition };
}
