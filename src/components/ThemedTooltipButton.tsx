import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip: string;
  anchorRef?: RefObject<HTMLButtonElement | null>;
}

/** Shared action button with an application-themed, viewport-bound tooltip. */
export function ThemedTooltipButton({ tooltip, anchorRef, children, onClick, ...props }: Props) {
  const localRef = useRef<HTMLButtonElement>(null);
  const anchor = anchorRef ?? localRef;
  const surface = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const hide = () => setOpen(false);
  const show = () => {
    if (open || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    setPosition({ left: rect.left, top: rect.bottom + 6 });
    setOpen(true);
  };
  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect();
    const bubble = surface.current;
    if (!open || !rect || !bubble) return;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - bubble.offsetWidth / 2, window.innerWidth - bubble.offsetWidth - 8));
    const above = rect.bottom + 6 + bubble.offsetHeight > window.innerHeight - 8;
    setPosition({ left, top: above ? Math.max(8, rect.top - bubble.offsetHeight - 6) : rect.bottom + 6,
      transformOrigin: `${Math.max(8, Math.min(rect.left + rect.width / 2 - left, bubble.offsetWidth - 8))}px ${above ? "bottom" : "top"}`,
      "--tooltip-offset": above ? "4px" : "-4px" } as CSSProperties);
  }, [open, tooltip, anchor]);
  useEffect(() => {
    if (open || !position) return;
    const timer = window.setTimeout(() => setPosition(null), 160);
    return () => window.clearTimeout(timer);
  }, [open, position]);
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
  return <>
    <button {...props} ref={anchor} type={props.type ?? "button"} aria-describedby={open ? id : undefined}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onKeyDown={event => { if (event.key === "Escape") hide(); props.onKeyDown?.(event); }}
      onClick={event => { hide(); onClick?.(event); }}>{children}</button>
    {position && createPortal(<div ref={surface} id={id} role="tooltip" aria-hidden={!open} data-open={open}
      className="themed-tooltip themed-action-tooltip" style={position}>{tooltip}</div>, document.body)}
  </>;
}
