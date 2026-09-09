import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";

const TRACK_INSET = 2;
const MIN_THUMB_SIZE = 24;
const EDGE_REVEAL_DISTANCE = 12;
const HIDE_DELAY_MS = 1000;

type Axis = "x" | "y";
type ScrollbarDensity = "regular" | "compact";
type TrackInsets = { top?: number; right?: number; bottom?: number; left?: number };
type AxisMetrics = { overflow: boolean; position: number; size: number; travel: number };
type Metrics = { x: AxisMetrics; y: AxisMetrics };
type DragState = { axis: Axis; pointerId: number; pointerStart: number; scrollStart: number; travel: number; scrollRange: number };

export type OverlayScrollAreaProps = {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  viewportProps?: Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "onScroll">;
  onScroll?: HTMLAttributes<HTMLDivElement>["onScroll"];
  density?: ScrollbarDensity;
  trackInsets?: TrackInsets;
};

const emptyAxis: AxisMetrics = { overflow: false, position: TRACK_INSET, size: 0, travel: 0 };

function axisMetrics(clientSize: number, scrollSize: number, scrollPosition: number, startInset = TRACK_INSET, endInset = TRACK_INSET): AxisMetrics {
  const trackSize = Math.max(0, clientSize - startInset - endInset);
  const scrollRange = Math.max(0, scrollSize - clientSize);
  if (scrollRange <= 0 || trackSize <= 0) return emptyAxis;
  const size = Math.min(trackSize, Math.max(MIN_THUMB_SIZE, trackSize * clientSize / scrollSize));
  const travel = Math.max(0, trackSize - size);
  return { overflow: true, position: startInset + travel * scrollPosition / scrollRange, size, travel };
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export const OverlayScrollArea = forwardRef<HTMLDivElement, OverlayScrollAreaProps>(function OverlayScrollArea({ children, className = "", viewportClassName = "", viewportProps, onScroll, density = "regular", trackInsets }, forwardedRef) {
  const insetTop = trackInsets?.top ?? TRACK_INSET;
  const insetRight = trackInsets?.right ?? TRACK_INSET;
  const insetBottom = trackInsets?.bottom ?? TRACK_INSET;
  const insetLeft = trackInsets?.left ?? TRACK_INSET;
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ x: emptyAxis, y: emptyAxis });
  const [scrolling, setScrolling] = useState(false);
  const [edge, setEdge] = useState<Axis | null>(null);
  const [dragging, setDragging] = useState<Axis | null>(null);

  const setViewportRef = useCallback((element: HTMLDivElement | null) => {
    viewportRef.current = element;
    assignRef(forwardedRef, element);
  }, [forwardedRef]);

  const measure = useCallback(() => {
    frameRef.current = null;
    const viewport = viewportRef.current;
    if (!viewport) return;
    setMetrics({
      x: axisMetrics(viewport.clientWidth, viewport.scrollWidth, viewport.scrollLeft, insetLeft, insetRight),
      y: axisMetrics(viewport.clientHeight, viewport.scrollHeight, viewport.scrollTop, insetTop, insetBottom),
    });
  }, [insetBottom, insetLeft, insetRight, insetTop]);

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = -1;
    const frame = window.requestAnimationFrame(measure);
    if (frameRef.current !== null) frameRef.current = frame;
  }, [measure]);

  const revealTemporarily = useCallback(() => {
    setScrolling(true);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setScrolling(false);
    }, HIDE_DELAY_MS);
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(viewport);
    for (const child of viewport.children) observer?.observe(child);
    const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      for (const child of viewport.children) observer?.observe(child);
      scheduleMeasure();
    });
    mutationObserver?.observe(viewport, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      observer?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, [measure, scheduleMeasure]);

  useLayoutEffect(scheduleMeasure, [children, scheduleMeasure]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag) {
      const viewport = viewportRef.current;
      if (!viewport || drag.travel <= 0) return;
      const pointer = drag.axis === "y" ? event.clientY : event.clientX;
      const next = drag.scrollStart + (pointer - drag.pointerStart) / drag.travel * drag.scrollRange;
      if (drag.axis === "y") viewport.scrollTop = next;
      else viewport.scrollLeft = next;
      scheduleMeasure();
      return;
    }
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) return;
    if (metrics.y.overflow && bounds.right - event.clientX <= EDGE_REVEAL_DISTANCE) setEdge("y");
    else if (metrics.x.overflow && bounds.bottom - event.clientY <= EDGE_REVEAL_DISTANCE) setEdge("x");
    else setEdge(null);
  };

  const beginDrag = (axis: Axis, event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const axisState = metrics[axis];
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      axis,
      pointerId: event.pointerId,
      pointerStart: axis === "y" ? event.clientY : event.clientX,
      scrollStart: axis === "y" ? viewport.scrollTop : viewport.scrollLeft,
      travel: axisState.travel,
      scrollRange: axis === "y" ? viewport.scrollHeight - viewport.clientHeight : viewport.scrollWidth - viewport.clientWidth,
    };
    setDragging(axis);
    revealTemporarily();
    event.preventDefault();
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(null);
    revealTemporarily();
  };

  const style = {
    "--overlay-scrollbar-x-position": `${metrics.x.position}px`,
    "--overlay-scrollbar-x-size": `${metrics.x.size}px`,
    "--overlay-scrollbar-y-position": `${metrics.y.position}px`,
    "--overlay-scrollbar-y-size": `${metrics.y.size}px`,
    "--overlay-scrollbar-y-edge": `${insetRight}px`,
    "--overlay-scrollbar-x-edge": `${insetBottom}px`,
  } as CSSProperties;

  return <div
    ref={rootRef}
    className={`overlay-scroll-area${className ? ` ${className}` : ""}`}
    data-overflow-x={metrics.x.overflow}
    data-overflow-y={metrics.y.overflow}
    data-density={density}
    data-scrolling={scrolling || undefined}
    data-edge-x={edge === "x" || undefined}
    data-edge-y={edge === "y" || undefined}
    data-dragging={dragging || undefined}
    style={style}
    onPointerMove={handlePointerMove}
    onPointerLeave={() => { if (!dragRef.current) setEdge(null); }}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
  >
    <div {...viewportProps} ref={setViewportRef} className={`overlay-scroll-viewport${viewportClassName ? ` ${viewportClassName}` : ""}`} onScroll={(event) => { scheduleMeasure(); revealTemporarily(); onScroll?.(event); }}>{children}</div>
    <div className="overlay-scrollbars" aria-hidden="true">
      {metrics.y.overflow && <span className="overlay-scrollbar overlay-scrollbar-y"><span className="overlay-scrollbar-thumb" onPointerDown={(event) => beginDrag("y", event)} onLostPointerCapture={endDrag}/></span>}
      {metrics.x.overflow && <span className="overlay-scrollbar overlay-scrollbar-x"><span className="overlay-scrollbar-thumb" onPointerDown={(event) => beginDrag("x", event)} onLostPointerCapture={endDrag}/></span>}
    </div>
  </div>;
});
