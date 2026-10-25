import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";

export function isElementOverflowing(element: HTMLElement) {
  return element.scrollWidth > element.clientWidth;
}

export function useThemedTooltip<T extends HTMLElement>({ tooltip, anchorRef, shouldShow, placement = "auto", disabled = false }: {
  tooltip: string;
  anchorRef?: RefObject<T | null>;
  shouldShow?: (anchor: T) => boolean;
  placement?: "auto" | "above";
  disabled?: boolean;
}) {
  const localRef = useRef<T>(null);
  const anchor = anchorRef ?? localRef;
  const surface = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const hide = () => { setOpen(false); setPosition(null); };
  const show = () => {
    const element = anchor.current;
    if (disabled || open || !element || (shouldShow && !shouldShow(element))) return;
    const rect = element.getBoundingClientRect();
    setPosition({ left: rect.left, top: rect.bottom + 6 });
    setOpen(true);
  };

  // Re-enabling requires a fresh interaction instead of reviving a stale bubble.
  if (disabled && (open || position)) { setOpen(false); setPosition(null); }

  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect();
    const bubble = surface.current;
    if (!open || !rect || !bubble) return;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - bubble.offsetWidth / 2, window.innerWidth - bubble.offsetWidth - 8));
    const above = (placement === "above" && rect.top - bubble.offsetHeight - 6 >= 8) || rect.bottom + 6 + bubble.offsetHeight > window.innerHeight - 8;
    setPosition({ left, top: above ? Math.max(8, rect.top - bubble.offsetHeight - 6) : rect.bottom + 6 });
  }, [anchor, open, tooltip, placement]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    document.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
      document.removeEventListener("scroll", hide, true);
    };
  }, [open]);

  return [anchor, !disabled && open ? id : undefined, hide, show, !disabled && open && position && createPortal(<div ref={surface} id={id} role="tooltip" data-app-overlay="floating" data-overlay-motion="hover"
      className="themed-tooltip themed-action-tooltip" style={position}>{tooltip}</div>, document.body),
  ] as const;
}
