import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type PointerEvent, type FocusEvent } from "react";
import { layoutWorkspaceDeck, type DeckCard } from "./workspaceTabDeck";

interface MotionCard { x: number; width: number; vx: number; vw: number }
interface Options {
  ids: string[]; selectedId: string; lockedId: string | null; dragging: boolean;
  strip: RefObject<HTMLElement | null>; tabs: RefObject<Map<string, HTMLDivElement>>;
}
export function useWorkspaceTabDeck({ ids, selectedId, lockedId, dragging, strip, tabs }: Options) {
  const [available, setAvailable] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const pointer = useRef({ x: -1, y: -1 });
  const motion = useRef(new Map<string, MotionCard>());
  const previewId = lockedId ?? (dragging ? hovered : focused ?? hovered);
  const layout = useMemo(() => layoutWorkspaceDeck(ids, selectedId, previewId, available), [ids, selectedId, previewId, available]);
  const previousSelection = useRef("");
  useLayoutEffect(() => {
    const node = strip.current;
    if (!node) return;
    const update = () => setAvailable(node.clientWidth);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    window.addEventListener("resize", update);
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [strip]);

  useLayoutEffect(() => {
    const node = strip.current;
    if (!node) return;
    let frame = 0;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const apply = (card: DeckCard, value: MotionCard) => {
      const tab = tabs.current.get(card.id);
      if (!tab) return;
      tab.style.setProperty("--workspace-deck-x", `${value.x}px`);
      tab.style.setProperty("--workspace-visible-width", `${value.width}px`);
    };
    if (!layout.stacked) {
      motion.current.clear();
      node.dispatchEvent(new Event("workspace-tab-layout"));
      return;
    }
    const alive = new Set(layout.cards.map(card => card.id));
    for (const id of motion.current.keys()) if (!alive.has(id)) motion.current.delete(id);
    for (const card of layout.cards) {
      if (!motion.current.has(card.id)) motion.current.set(card.id, { x: card.x, width: card.width, vx: 0, vw: 0 });
      apply(card, motion.current.get(card.id)!);
    }
    if (dragging) return;
    let previous = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 1 / 30);
      previous = now;
      let unsettled = false;
      for (const card of layout.cards) {
        const value = motion.current.get(card.id)!;
        if (reduced?.matches || dragging) { value.x = card.x; value.width = card.width; value.vx = 0; value.vw = 0; }
        else {
          // Critically damped spring; velocities survive retargets and interrupted previews.
          for (const [key, velocity, target] of [["x", "vx", card.x], ["width", "vw", card.width]] as const) {
            value[velocity] += (400 * (target - value[key]) - 40 * value[velocity]) * dt;
            value[key] += value[velocity] * dt;
            if (Math.abs(target - value[key]) < .1 && Math.abs(value[velocity]) < .5) { value[key] = target; value[velocity] = 0; }
            else unsettled = true;
          }
        }
        apply(card, value);
      }
      node.dispatchEvent(new Event("workspace-tab-layout"));
      if (unsettled) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [layout, dragging, strip, tabs]);

  useLayoutEffect(() => {
    const node = strip.current;
    const key = `${selectedId}:${available}:${layout.stacked}:${ids.join(",")}`;
    if (!node || previousSelection.current === key) return;
    previousSelection.current = key;
    if (!layout.stacked) return;
    const card = layout.cards.find(card => card.id === selectedId);
    if (!card) return;
    if (card.x < node.scrollLeft) node.scrollTo({ left: card.x });
    else if (card.x + card.width > node.scrollLeft + available - 33) node.scrollTo({ left: card.x + card.width - available + 33 });
  }, [layout, ids, selectedId, available, strip]);

  useEffect(() => {
    if (!lockedId && !dragging && pointer.current.x === -1) setHovered(null);
  }, [lockedId, dragging]);
  useEffect(() => {
    const clear = () => { setHovered(null); setFocused(null); };
    window.addEventListener("blur", clear);
    return () => window.removeEventListener("blur", clear);
  }, []);
  const targetId = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(".workspace-tab")?.dataset.workspaceId ?? null : null;
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (lockedId || dragging || event.pointerType === "touch" || event.buttons) return;
    if (pointer.current.x === event.clientX && pointer.current.y === event.clientY) return;
    pointer.current = { x: event.clientX, y: event.clientY };
    // Geometry changes alone must never choose a different preview under a stationary pointer.
    const current = hovered ? tabs.current.get(hovered)?.getBoundingClientRect() : null;
    if (current && event.clientX >= current.left && event.clientX < current.right && event.clientY >= current.top && event.clientY <= current.bottom) return;
    setFocused(null);
    setHovered(targetId(event.target));
  };
  const onFocusCapture = (event: FocusEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.matches(":focus-visible")) setFocused(targetId(event.target));
  };
  return {
    layout,
    events: {
      onPointerMove,
      onPointerLeave: () => { pointer.current = { x: -1, y: -1 }; if (!lockedId && !dragging) setHovered(null); },
      onFocusCapture,
      onBlurCapture: (event: FocusEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null); },
    },
  };
}
