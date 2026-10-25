import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { dropPosition } from "./layoutPresentation";
import { calculateLayoutGeometry, resolveLayoutBounds, type LayoutDividerGeometry, type LayoutGeometry } from "./layoutGeometry";
import type { DropPosition } from "./layout";
import type { Workspace } from "./model";
import type { WorkspaceAction } from "./reducer";

export interface LayoutDrag {
  sourceId: string; targetId: string | null; position: DropPosition | null; x: number; y: number;
}

/** Hit-test workspace geometry, including native webviews which are outside the DOM hit-test tree. */
export function layoutDropTarget(geometry: LayoutGeometry, surface: DOMRect, sourceId: string, x: number, y: number) {
  for (const { node, bounds } of geometry.leaves) {
    const rect = resolveLayoutBounds(bounds, surface.width, surface.height);
    const left = surface.left + rect.x, top = surface.top + rect.y;
    if (node.blockId !== sourceId && x >= left && x < left + rect.width && y >= top && y < top + rect.height) {
      return { targetId: node.blockId, position: dropPosition(new DOMRect(left, top, rect.width, rect.height), x, y) };
    }
  }
  return { targetId: null, position: null };
}

/** One captured gesture at a time. Cancellation never commits a layout mutation. */
export function useLayoutInteractions(workspace: Workspace, visible: boolean, dispatch: (action: WorkspaceAction) => void) {
  const [drag, setDrag] = useState<LayoutDrag | null>(null);
  const [liveRatios, setLiveRatios] = useState<Record<string, number>>({});
  const layoutSurfaceRef = useRef<HTMLDivElement>(null);
  const cancelGesture = useRef<(() => void) | null>(null);
  const geometry = calculateLayoutGeometry(workspace.layout, liveRatios);
  const latestGeometry = useRef(geometry);
  useLayoutEffect(() => { latestGeometry.current = geometry; }, [geometry]);
  useEffect(() => {
    if (!visible) cancelGesture.current?.();
    return () => cancelGesture.current?.();
  }, [visible, workspace.id]);

  function capture(event: ReactPointerEvent<HTMLElement>, move: (pointer: PointerEvent) => void, finish: (pointer: PointerEvent | null) => void) {
    cancelGesture.current?.();
    const element = event.currentTarget, pointerId = event.pointerId;
    const update = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) move(pointer); };
    const end = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) stop(pointer); };
    const cancelPointer = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) stop(null); };
    const cancel = () => stop(null);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } };
    let stopped = false;
    function stop(pointer: PointerEvent | null) {
      if (stopped) return;
      stopped = true;
      window.removeEventListener("pointermove", update, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", cancelPointer, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      element.removeEventListener("lostpointercapture", cancelPointer);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      cancelGesture.current = null;
      finish(pointer);
    }
    element.setPointerCapture(pointerId);
    cancelGesture.current = cancel;
    window.addEventListener("pointermove", update, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", cancelPointer, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    element.addEventListener("lostpointercapture", cancelPointer);
  }

  function beginDrag(event: ReactPointerEvent<HTMLElement>, sourceId: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, input, [role=tab]")) return;
    const start = { x: event.clientX, y: event.clientY };
    let committed = false;
    const target = (pointer: PointerEvent) => {
      const surface = layoutSurfaceRef.current;
      return surface ? layoutDropTarget(latestGeometry.current, surface.getBoundingClientRect(), sourceId, pointer.clientX, pointer.clientY) : { targetId: null, position: null };
    };
    capture(event, pointer => {
      if (!committed && Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y) < 10) return;
      committed = true;
      setDrag({ sourceId, ...target(pointer), x: pointer.clientX, y: pointer.clientY });
    }, pointer => {
      setDrag(null);
      const drop = pointer && committed ? target(pointer) : null;
      if (drop?.targetId && drop.position) dispatch({ type: "moveBlock", workspaceId: workspace.id, sourceId, ...drop });
    });
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>, divider: LayoutDividerGeometry) {
    if (event.button !== 0 || !layoutSurfaceRef.current) return;
    event.preventDefault();
    let current = divider.ratio;
    capture(event, pointer => {
      const surface = layoutSurfaceRef.current?.getBoundingClientRect();
      if (!surface) return;
      const bounds = resolveLayoutBounds(divider.containerBounds, surface.width, surface.height);
      const span = divider.direction === "horizontal" ? bounds.width : bounds.height;
      if (span <= 0) return;
      const offset = divider.direction === "horizontal" ? pointer.clientX - surface.left - bounds.x : pointer.clientY - surface.top - bounds.y;
      current = Math.min(.85, Math.max(.15, offset / span));
      setLiveRatios(ratios => ({ ...ratios, [divider.id]: current }));
    }, pointer => {
      if (pointer) dispatch({ type: "resizeSplit", workspaceId: workspace.id, splitId: divider.id, ratio: current });
      setLiveRatios(ratios => { const next = { ...ratios }; delete next[divider.id]; return next; });
    });
  }
  return { drag, geometry, layoutSurfaceRef, beginDrag, startResize };
}
