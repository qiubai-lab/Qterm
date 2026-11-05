import type { Terminal } from "@xterm/xterm";

/** A finger scrolls terminal history, never emits shell mouse clicks or keystrokes. */
export function bindTerminalTouchScroll(element: HTMLElement, terminal: Pick<Terminal, "rows" | "scrollLines">) {
  let lastY: number | undefined;
  let remainder = 0;
  const start = (event: TouchEvent) => {
    lastY = event.touches.length === 1 ? event.touches[0].clientY : undefined;
    remainder = 0;
  };
  const move = (event: TouchEvent) => {
    if (event.touches.length !== 1) { lastY = undefined; return; }
    if (lastY === undefined) return;
    const y = event.touches[0].clientY;
    remainder += lastY - y; lastY = y;
    const lineHeight = Math.max(1, element.clientHeight / Math.max(1, terminal.rows));
    const lines = Math.trunc(remainder / lineHeight);
    event.preventDefault(); event.stopPropagation();
    if (lines) { terminal.scrollLines(lines); remainder -= lines * lineHeight; }
  };
  const end = () => { lastY = undefined; remainder = 0; };
  element.addEventListener("touchstart", start, { passive:true });
  element.addEventListener("touchmove", move, { passive:false });
  element.addEventListener("touchend", end);
  element.addEventListener("touchcancel", end);
  return () => {
    element.removeEventListener("touchstart", start); element.removeEventListener("touchmove", move);
    element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", end);
  };
}
