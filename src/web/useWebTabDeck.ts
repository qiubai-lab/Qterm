import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type FocusEvent, type RefObject } from "react";
import { stepDeckSpring } from "../components/tabDeck";
import { layoutWebTabDeck, WEB_TAB_OVERLAP, WEB_TAB_WIDTH } from "./webTabDeck";

interface Motion { x: number; width: number; expansion: number; vx: number; vw: number; ve: number }

/** Header-only geometry and preview motion; page selection/lifetime stay in WebTabs. */
export function useWebTabDeck(ids: string[], selected: string, barRef: RefObject<HTMLDivElement | null>, stripRef: RefObject<HTMLDivElement | null>, tabRefs: RefObject<Map<string, HTMLDivElement>>, lockedId: string | null = null) {
  const motion = useRef(new Map<string, Motion>());
  const previousSelection = useRef("");
  const revealingSelection = useRef(false);
  const pointer = useRef({ x: -1, y: -1 });
  const [available, setAvailable] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const candidate = lockedId ?? focused ?? hovered;
  const preview = candidate && ids.includes(candidate) ? candidate : null;
  const { layout, overflowing } = useMemo(() => layoutWebTabDeck(ids, selected, preview, available), [ids, selected, preview, available]);

  useLayoutEffect(() => {
    const node = barRef.current;
    if (!node) return;
    const measure = () => setAvailable(node.clientWidth);
    measure(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure); observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [barRef]);

  useLayoutEffect(() => {
    const node = stripRef.current;
    if (!node) return;
    const key = `${selected}:${available}:${layout.stacked}:${ids.join(",")}`;
    if (previousSelection.current !== key) { previousSelection.current = key; revealingSelection.current = true; }
    if (!layout.stacked) { motion.current.clear(); revealingSelection.current = false; node.scrollLeft = 0; return; }
    const alive = new Set(ids);
    for (const id of motion.current.keys()) if (!alive.has(id)) motion.current.delete(id);
    const insets = new Map(layout.cards.map(card => [card.id, Math.max(0, (WEB_TAB_WIDTH - 42 - (tabRefs.current.get(card.id)?.querySelector<HTMLElement>('[role="tab"]>span:last-child')?.scrollWidth ?? 70)) / 2)]));
    const paint = (id: string, value: Motion) => {
      const element = tabRefs.current.get(id);
      const expansion = Math.max(0, Math.min(1, value.expansion));
      element?.style.setProperty("--web-deck-x", `${value.x}px`);
      element?.style.setProperty("--web-deck-width", `${value.width}px`);
      element?.style.setProperty("--web-title-inset", `${expansion * (insets.get(id) ?? 0)}px`);
      element?.style.setProperty("--web-title-end", `${expansion * 20}px`);
    };
    const width = (card: typeof layout.cards[number]) => Math.min(WEB_TAB_WIDTH, card.width + (card.expanded ? 0 : WEB_TAB_OVERLAP));
    for (const card of layout.cards) {
      if (!motion.current.has(card.id)) motion.current.set(card.id, { x: card.x, width: width(card), expansion: Number(card.expanded), vx: 0, vw: 0, ve: 0 });
      paint(card.id, motion.current.get(card.id)!);
    }
    let previous = performance.now(), frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const step = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 1 / 30); previous = now;
      let unsettled = false;
      for (const card of layout.cards) {
        const value = motion.current.get(card.id)!;
        for (const [key, velocity, target] of [["x", "vx", card.x], ["width", "vw", width(card)], ["expansion", "ve", Number(card.expanded)]] as const) {
          const next = reduced.matches ? { value: target, velocity: 0, settled: true } : stepDeckSpring(value[key], value[velocity], target, dt, key === "expansion" ? .001 : .1);
          value[key] = next.value; value[velocity] = next.velocity;
          unsettled ||= !next.settled;
        }
        paint(card.id, value);
      }
      const target = preview ? motion.current.get(preview) : revealingSelection.current ? motion.current.get(selected) : null;
      if (target) {
        if (target.x < node.scrollLeft) node.scrollLeft = Math.floor(target.x);
        else if (target.x + target.width > node.scrollLeft + node.clientWidth) node.scrollLeft = Math.ceil(target.x + target.width - node.clientWidth);
      }
      if (unsettled) frame = requestAnimationFrame(step);
      else revealingSelection.current = false;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ids, layout, preview, selected, available, stripRef, tabRefs]);

  useEffect(() => {
    const reset = () => { setHovered(null); setFocused(null); pointer.current = { x: -1, y: -1 }; };
    window.addEventListener("blur", reset); return () => window.removeEventListener("blur", reset);
  }, []);
  const targetId = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(".web-tab")?.dataset.tabId ?? null : null;
  return { layout, overflowing, events: {
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (lockedId || event.pointerType === "touch" || event.buttons || (pointer.current.x === event.clientX && pointer.current.y === event.clientY)) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      const current = hovered ? tabRefs.current.get(hovered)?.getBoundingClientRect() : null;
      if (current && event.clientX >= current.left && event.clientX < current.right && event.clientY >= current.top && event.clientY <= current.bottom) return;
      setFocused(null); setHovered(targetId(event.target));
    },
    onPointerLeave: () => { pointer.current = { x: -1, y: -1 }; setHovered(null); },
    onFocusCapture: (event: FocusEvent<HTMLDivElement>) => { if (event.target.matches(":focus-visible")) setFocused(targetId(event.target)); },
    onBlurCapture: (event: FocusEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null); },
  } };
}
