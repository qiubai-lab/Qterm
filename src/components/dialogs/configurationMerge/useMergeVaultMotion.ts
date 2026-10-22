import { useEffect, useRef, useState } from "react";
import { useDialogCloseTransition } from "../useDialogCloseTransition";

/** Owns only presentation timing; credential verification stays in the merge controller. */
export function useMergeVaultMotion() {
  const [motion, setMotion] = useState<"idle" | "leaving" | "entering">("idle");
  const timer = useRef<number | null>(null);
  const closeTransition = useDialogCloseTransition();
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  function advance(complete: () => void) {
    if (timer.current !== null || closeTransition.closing) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      complete();
      return;
    }
    setMotion("leaving");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setMotion("entering");
      complete();
    }, 90);
  }

  return { motion, advance, ...closeTransition };
}
