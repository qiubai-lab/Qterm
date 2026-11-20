import { useEffect, useRef, type RefObject } from "react";
import type { TerminalView } from "./terminalView";

/** Reveal, connection and resize notifications share one measurement per animation frame. */
export function useTerminalViewport(view: RefObject<TerminalView | null>, container: RefObject<HTMLElement | null>,
  sessionKey: string, visible: boolean, connectedId: string | null) {
  const synchronized = useRef<string | null>(null);
  useEffect(() => {
    if (!connectedId) synchronized.current = null;
    const element = container.current;
    if (!visible || !element) return;
    let frame: number | undefined;
    let attempts = 0;
    function schedule() {
      if (frame === undefined) frame = requestAnimationFrame(measure);
    }
    function measure() {
      frame = undefined;
      const force = connectedId !== null && synchronized.current !== connectedId;
      if (view.current?.layout.restore(force)) synchronized.current = connectedId;
      else if (++attempts < 12) schedule();
    }
    const observer = new ResizeObserver(() => { attempts = 0; schedule(); });
    observer.observe(element);
    schedule();
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [connectedId, container, sessionKey, view, visible]);
}
