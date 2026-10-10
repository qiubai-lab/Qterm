import { useEffect, useState, type AnimationEvent } from "react";
import type { TerminalProgress } from "./terminalActivity";

interface Presence { progress: TerminalProgress | null; closing: boolean }
// Covers disabled animations, hidden workspaces and WebViews without animationend.
const EXIT_FALLBACK_MS = 180;

export function useTerminalProgressPresence(progress: TerminalProgress | null) {
  const [presence, setPresence] = useState<Presence>({ progress, closing: false });
  // Adjust during render so a cleared status never remains accessible for a frame.
  if (progress && (presence.progress !== progress || presence.closing)) {
    setPresence({ progress, closing: false });
  } else if (!progress && presence.progress && !presence.closing) {
    setPresence({ ...presence, closing: true });
  }
  useEffect(() => {
    if (!presence.closing) return;
    const timer = window.setTimeout(() => setPresence({ progress: null, closing: false }), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [presence.closing]);
  const onAnimationEnd = (event: AnimationEvent<HTMLSpanElement>) => {
    if (presence.closing && event.target === event.currentTarget && event.animationName === "terminal-progress-exit") {
      setPresence({ progress: null, closing: false });
    }
  };
  return { ...presence, onAnimationEnd };
}
