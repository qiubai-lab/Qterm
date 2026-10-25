import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./tabActionMenu.css";

interface Props<T extends string> {
  x: number; y: number; label: string; className?: string; keepOnInternalScroll?: boolean;
  items: { id: T; label: string; count: number }[];
  onChoose: (id: T) => void; onDismiss: (restore?: boolean) => void;
}
export function TabActionMenu<T extends string>({ x, y, label, className = "", keepOnInternalScroll = false, items: actions, onChoose, onDismiss }: Props<T>) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = menu.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    (node.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? node).focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!node.contains(event.target as Node)) onDismiss(false); };
    const dismiss = () => onDismiss(false);
    const scroll = (event: Event) => {
      // Native overlays are viewport-positioned; internal reveal scrolling must not dismiss them.
      if (!keepOnInternalScroll || event.target === window || event.target === document) dismiss();
    };
    const dialogSelector = '[aria-modal="true"]';
    const overlays = new MutationObserver(() => { if (document.querySelector(dialogSelector)) onDismiss(false); });
    overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    window.addEventListener("scroll", scroll, true);
    return () => { overlays.disconnect(); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", dismiss); window.removeEventListener("blur", dismiss); window.removeEventListener("scroll", scroll, true); };
  }, [x, y, onDismiss, keepOnInternalScroll]);
  return createPortal(<div ref={menu} className={`terminal-context-menu tab-action-menu ${className}`} role="menu" data-app-overlay="floating" aria-label={label} tabIndex={-1} style={{ left: x, top: y }}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); onDismiss(); return; }
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        items[next]?.focus({ preventScroll: true });
      }
    }}>
    {actions.map(item => <button type="button" role="menuitem" key={item.id} disabled={!item.count} onClick={() => onChoose(item.id)}><span>{item.label}</span><small aria-hidden="true">{item.count}</small></button>)}
  </div>, document.body);
}
