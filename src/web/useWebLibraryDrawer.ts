import { useCallback, useEffect, useState } from "react";

export type WebDrawerPhase = "closed" | "entering" | "open" | "closing";
const reducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Mount before entry; retain native clipping until the exit transition finishes. */
export function useWebLibraryDrawer() {
  const [phase, setPhase] = useState<WebDrawerPhase>("closed");
  useEffect(() => {
    if (phase === "entering") {
      let second = 0;
      const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setPhase("open")); });
      return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    }
    if (phase === "closing") {
      const timer = window.setTimeout(() => setPhase("closed"), 180);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);
  const show = useCallback(() => setPhase(previous => previous === "closing" || reducedMotion() ? "open" : previous === "closed" ? "entering" : previous), []);
  const close = useCallback(() => setPhase(previous => previous === "closed" || reducedMotion() ? "closed" : "closing"), []);
  return { phase, present: phase !== "closed", open: phase === "open" || phase === "entering", show, close };
}
