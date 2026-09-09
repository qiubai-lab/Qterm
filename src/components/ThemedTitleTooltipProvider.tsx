import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { isElementOverflowing } from "./useThemedTooltip";

interface ActiveTitle {
  element: HTMLElement;
  title: string;
  describedBy: string | null;
  pointer: boolean;
  focus: boolean;
  visible: boolean;
}

interface TooltipPresentation {
  element: HTMLElement;
  text: string;
  open: boolean;
}

/** Converts product DOM title attributes into the shared Qterm tooltip surface. */
export function ThemedTitleTooltipProvider({ children }: { children: ReactNode }) {
  const tooltipId = useId();
  const active = useRef<ActiveTitle | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [presentation, setPresentation] = useState<TooltipPresentation | null>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    const anchor = presentation?.element;
    const bubble = surface.current;
    if (!presentation?.open || !anchor || !bubble) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - bubble.offsetWidth / 2, window.innerWidth - bubble.offsetWidth - 8));
    const above = rect.bottom + 6 + bubble.offsetHeight > window.innerHeight - 8;
    setPosition({ left, top: above ? Math.max(8, rect.top - bubble.offsetHeight - 6) : rect.bottom + 6,
      transformOrigin: `${Math.max(8, Math.min(rect.left + rect.width / 2 - left, bubble.offsetWidth - 8))}px ${above ? "bottom" : "top"}`,
      "--tooltip-offset": above ? "4px" : "-4px" } as CSSProperties);
  }, [presentation]);

  useEffect(() => {
    if (!presentation || presentation.open) return;
    const timer = window.setTimeout(() => { setPresentation(null); setPosition(null); }, 160);
    return () => window.clearTimeout(timer);
  }, [presentation]);

  useEffect(() => {
    function restore(current: ActiveTitle, close = true) {
      if (current.element.isConnected && !current.element.hasAttribute("title")) current.element.setAttribute("title", current.title);
      if (current.element.isConnected) {
        if (current.describedBy === null) current.element.removeAttribute("aria-describedby");
        else current.element.setAttribute("aria-describedby", current.describedBy);
      }
      if (close && current.visible) setPresentation((value) => value ? { ...value, open: false } : value);
    }

    function dismiss(immediate = false) {
      const current = active.current;
      if (!current?.visible) return;
      current.visible = false;
      if (current.describedBy === null) current.element.removeAttribute("aria-describedby");
      else current.element.setAttribute("aria-describedby", current.describedBy);
      if (immediate) {
        setPresentation(null);
        setPosition(null);
      } else {
        setPresentation((value) => value ? { ...value, open: false } : value);
      }
    }

    function titledElement(target: EventTarget | null) {
      if (!(target instanceof Element)) return null;
      const titled = target.closest<HTMLElement>("[title]");
      if (titled) return titled;
      return active.current?.element.contains(target) ? active.current.element : null;
    }

    function activate(target: EventTarget | null, source: "pointer" | "focus") {
      const element = titledElement(target);
      if (!element) return;
      const existing = active.current;
      if (existing?.element === element) {
        existing[source] = true;
        return;
      }
      if (existing) restore(existing);
      const title = element.getAttribute("title")?.trim();
      if (!title) { active.current = null; return; }
      const visibleText = element.textContent?.replace(/\s+/gu, " ").trim() ?? "";
      const visible = title.replace(/\s+/gu, " ") !== visibleText || isElementOverflowing(element);
      const describedBy = element.getAttribute("aria-describedby");
      element.removeAttribute("title");
      if (visible) {
        element.setAttribute("aria-describedby", [describedBy, tooltipId].filter(Boolean).join(" "));
        const rect = element.getBoundingClientRect();
        setPosition({ left: rect.left, top: rect.bottom + 6 });
        setPresentation({ element, text: title, open: true });
      }
      active.current = { element, title, describedBy, pointer: source === "pointer", focus: source === "focus", visible };
    }

    function deactivate(source: "pointer" | "focus", relatedTarget: EventTarget | null) {
      const current = active.current;
      if (!current || relatedTarget instanceof Node && current.element.contains(relatedTarget)) return;
      current[source] = false;
      if (current.pointer || current.focus) return;
      restore(current);
      active.current = null;
    }

    const onPointerOver = (event: PointerEvent) => activate(event.target, "pointer");
    const onPointerOut = (event: PointerEvent) => deactivate("pointer", event.relatedTarget);
    const onFocusIn = (event: FocusEvent) => activate(event.target, "focus");
    const onFocusOut = (event: FocusEvent) => deactivate("focus", event.relatedTarget);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    const onActivate = () => dismiss(true);
    const onPassiveDismiss = () => dismiss();
    const onWindowBlur = () => {
      const current = active.current;
      if (current) restore(current);
      active.current = null;
    };
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onActivate, true);
    document.addEventListener("click", onActivate, true);
    document.addEventListener("scroll", onPassiveDismiss, true);
    window.addEventListener("resize", onPassiveDismiss);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onActivate, true);
      document.removeEventListener("click", onActivate, true);
      document.removeEventListener("scroll", onPassiveDismiss, true);
      window.removeEventListener("resize", onPassiveDismiss);
      window.removeEventListener("blur", onWindowBlur);
      if (active.current) restore(active.current, false);
      active.current = null;
    };
  }, [tooltipId]);

  return <>{children}{presentation && position && createPortal(<div ref={surface} id={tooltipId} role="tooltip" aria-hidden={!presentation.open} data-open={presentation.open}
    className="themed-tooltip themed-action-tooltip" style={position}>{presentation.text}</div>, document.body)}</>;
}
