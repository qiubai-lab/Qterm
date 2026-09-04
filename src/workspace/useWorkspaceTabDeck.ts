import { useEffect, useLayoutEffect, useMemo, useCallback, useRef, useState, type RefObject, type PointerEvent, type FocusEvent } from "react";
import { layoutWorkspaceDeck, WORKSPACE_TAB_WIDTH, type DeckCard } from "./workspaceTabDeck";

interface MotionCard { x: number; width: number; expansion: number; vx: number; vw: number; ve: number }
const paintedWidth = (card: DeckCard) => Math.min(WORKSPACE_TAB_WIDTH, card.width + (card.expanded ? 0 : 8));
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
  const naturalLayout = useMemo(() => layoutWorkspaceDeck(ids, selectedId, previewId, available), [ids, selectedId, previewId, available]);
  // Reserve navigation for the largest ordinary preview, independent of the hovered id.
  const navigationLayout = useMemo(() => layoutWorkspaceDeck(ids, selectedId, ids.find(id => id !== selectedId) ?? null, available - 8), [ids, selectedId, available]);
  const overflowing = available > 0 && navigationLayout.width > available - 41 + 1;
  const layout = useMemo(() => overflowing ? layoutWorkspaceDeck(ids, selectedId, previewId, available - 66) : naturalLayout.stacked ? layoutWorkspaceDeck(ids, selectedId, previewId, available - 8) : naturalLayout, [ids, selectedId, previewId, available, overflowing, naturalLayout]);
  const previousSelection = useRef("");
  const revealingSelection = useRef(false);
  const revealCard = useCallback((node: HTMLElement | null, id: string) => {
    const card = motion.current.get(id);
    if (!node || !card) return;
    if (card.x < node.scrollLeft) node.scrollTo({ left: Math.floor(card.x), behavior: "instant" });
    else if (card.x + card.width + 8 > node.scrollLeft + node.clientWidth) node.scrollTo({ left: Math.ceil(card.x + card.width + 8 - node.clientWidth), behavior: "instant" });
  }, []);
  useLayoutEffect(() => {
    const node = strip.current;
    if (!node) return;
    const update = () => {
      setAvailable(node.parentElement?.clientWidth ?? node.clientWidth);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    if (node.parentElement) observer?.observe(node.parentElement);
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { observer?.disconnect(); node.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [strip]);

  useLayoutEffect(() => {
    const node = strip.current;
    if (!node) return;
    let frame = 0;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    // Measure intrinsic text once per layout, never during the animation frame.
    const titleInsets = new Map(layout.cards.map(card => {
      const title = tabs.current.get(card.id)?.querySelector<HTMLElement>(".workspace-notification-title");
      return [card.id, Math.max(0, (WORKSPACE_TAB_WIDTH - 2 - 58 - (title?.scrollWidth ?? 68)) / 2)];
    }));
    const apply = (card: DeckCard, value: MotionCard) => {
      const tab = tabs.current.get(card.id);
      if (!tab) return;
      tab.style.setProperty("--workspace-deck-x", `${value.x}px`);
      tab.style.setProperty("--workspace-visible-width", `${value.width}px`);
      const expansion = Math.max(0, Math.min(1, value.expansion));
      tab.style.setProperty("--workspace-title-inset", `${expansion * (titleInsets.get(card.id) ?? 0)}px`);
      tab.style.setProperty("--workspace-title-end", `${expansion * 29}px`);
    };
    if (!layout.stacked) {
      motion.current.clear();
      node.dispatchEvent(new Event("workspace-tab-layout"));
      return;
    }
    const alive = new Set(layout.cards.map(card => card.id));
    for (const id of motion.current.keys()) if (!alive.has(id)) motion.current.delete(id);
    for (const card of layout.cards) {
      if (!motion.current.has(card.id)) motion.current.set(card.id, { x: card.x, width: paintedWidth(card), expansion: Number(card.expanded), vx: 0, vw: 0, ve: 0 });
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
        if (reduced?.matches || dragging) { value.x = card.x; value.width = paintedWidth(card); value.expansion = Number(card.expanded); value.vx = 0; value.vw = 0; value.ve = 0; }
        else {
          // Critically damped spring; velocities survive retargets and interrupted previews.
          for (const [key, velocity, target] of [["x", "vx", card.x], ["width", "vw", paintedWidth(card)], ["expansion", "ve", Number(card.expanded)]] as const) {
            value[velocity] += (400 * (target - value[key]) - 40 * value[velocity]) * dt;
            value[key] += value[velocity] * dt;
            const precision = key === "expansion" ? .001 : .1;
            if (Math.abs(target - value[key]) < precision && Math.abs(value[velocity]) < precision * 5) { value[key] = target; value[velocity] = 0; }
            else unsettled = true;
          }
        }
        apply(card, value);
      }
      if (previewId && !dragging) revealCard(node, previewId);
      else if (revealingSelection.current) revealCard(node, selectedId);
      if (!unsettled) revealingSelection.current = false;
      node.dispatchEvent(new Event("workspace-tab-layout"));
      if (unsettled) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [layout, dragging, strip, tabs, revealCard, previewId, selectedId]);

  useLayoutEffect(() => {
    const node = strip.current;
    const key = `${selectedId}:${available}:${layout.stacked}:${overflowing}:${ids.join(",")}`;
    if (!node || previousSelection.current === key) return;
    previousSelection.current = key;
    if (!layout.stacked) return;
    revealingSelection.current = true;
    revealCard(node, selectedId);
  }, [layout, ids, selectedId, available, overflowing, strip, revealCard]);

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
    overflowing,
    events: {
      onPointerMove,
      onPointerLeave: () => { pointer.current = { x: -1, y: -1 }; if (!lockedId && !dragging) setHovered(null); },
      onFocusCapture,
      onBlurCapture: (event: FocusEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null); },
    },
  };
}
