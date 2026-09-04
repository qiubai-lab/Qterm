import { useEffect, useRef, useState, type RefObject, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useWorkspace } from "./WorkspaceProvider";

interface WorkspaceTabSlot { id: string; centerX: number }
interface WorkspaceDragGesture { id: string; pointerId: number; x: number; y: number; active: boolean; offsetX: number; targetId: string | null; slots: WorkspaceTabSlot[] }
interface WorkspaceDragVisual { id: string; offsetX: number; targetId: string | null }
const WORKSPACE_DRAG_THRESHOLD_PX = 10;

export function useWorkspaceTabDrag(workspaceTabRefs: RefObject<Map<string, HTMLDivElement>>, onReorderSelection: (order: string[]) => void) {
  const { document, activeWorkspace, dispatch } = useWorkspace();
  const [workspaceDragVisual, setWorkspaceDragVisual] = useState<WorkspaceDragVisual | null>(null);
  const [workspaceDropSettling, setWorkspaceDropSettling] = useState(false);
  const workspaceDragRef = useRef<WorkspaceDragGesture | null>(null);
  const workspaceDragCleanupRef = useRef<(() => void) | null>(null);
  const workspaceDragClickSuppressionRef = useRef<string | null>(null);
  const workspaceDragClickTimerRef = useRef<number | null>(null);
  const workspaceDropSettleFrameRef = useRef<number | null>(null);
  function beginWorkspaceDrag(event: ReactPointerEvent<HTMLDivElement>, workspaceId: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("input,.workspace-tab-close")) return;
    workspaceDragCleanupRef.current?.();
    const slots = document.workspaces.flatMap((workspace) => {
      const element = workspaceTabRefs.current.get(workspace.id);
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      const visible = element.closest<HTMLElement>(".workspace-tab-strip")?.dataset.stacked ? Number.parseFloat(element.style.getPropertyValue("--workspace-visible-width")) || rect.width : rect.width;
      return [{ id: workspace.id, centerX: rect.left + visible / 2 }];
    });
    const origin: WorkspaceDragGesture = { id: workspaceId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false, offsetX: 0, targetId: null, slots };
    workspaceDragRef.current = origin;
    const move = (pointer: PointerEvent) => {
      const state = workspaceDragRef.current;
      if (!state || pointer.pointerId !== state.pointerId) return;
      const offsetX = pointer.clientX - state.x;
      const offsetY = pointer.clientY - state.y;
      if (!state.active) {
        if (Math.abs(offsetY) >= WORKSPACE_DRAG_THRESHOLD_PX && Math.abs(offsetY) >= Math.abs(offsetX)) {
          finish();
          return;
        }
        if (Math.abs(offsetX) < WORKSPACE_DRAG_THRESHOLD_PX || Math.abs(offsetX) <= Math.abs(offsetY)) return;
      }
      pointer.preventDefault();
      const nextTargetId = resolveWorkspaceDropTarget(state.slots, workspaceId, offsetX);
      const nextGesture = { ...state, active: true, offsetX, targetId: nextTargetId };
      workspaceDragRef.current = nextGesture;
      setWorkspaceDragVisual({ id: workspaceId, offsetX, targetId: nextTargetId });
    };
    const finish = () => {
      workspaceDragRef.current = null;
      setWorkspaceDragVisual(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      if (workspaceDragCleanupRef.current === finish) workspaceDragCleanupRef.current = null;
    };
    const end = (pointer: PointerEvent) => {
      const state = workspaceDragRef.current;
      if (!state || pointer.pointerId !== state.pointerId) return;
      if (state.active) {
        workspaceDragClickSuppressionRef.current = workspaceId;
        if (workspaceDragClickTimerRef.current !== null) window.clearTimeout(workspaceDragClickTimerRef.current);
        workspaceDragClickTimerRef.current = window.setTimeout(() => {
          workspaceDragClickSuppressionRef.current = null;
          workspaceDragClickTimerRef.current = null;
        }, 0);
        if (state.targetId) {
          setWorkspaceDropSettling(true);
          if (workspaceDropSettleFrameRef.current !== null) window.cancelAnimationFrame(workspaceDropSettleFrameRef.current);
          workspaceDropSettleFrameRef.current = window.requestAnimationFrame(() => {
            workspaceDropSettleFrameRef.current = window.requestAnimationFrame(() => {
              workspaceDropSettleFrameRef.current = null;
              setWorkspaceDropSettling(false);
            });
          });
          if (activeWorkspace.id !== workspaceId) {
            onReorderSelection(moveWorkspaceInOrder(state.slots.map((slot) => slot.id), workspaceId, state.targetId));
          }
          dispatch({ type: "reorderWorkspace", workspaceId, targetWorkspaceId: state.targetId });
          if (activeWorkspace.id !== workspaceId) dispatch({ type: "selectWorkspace", workspaceId });
        }
      }
      finish();
    };
    const cancel = (pointer: PointerEvent) => {
      if (pointer.pointerId === workspaceDragRef.current?.pointerId) finish();
    };
    workspaceDragCleanupRef.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
  }

  function suppressWorkspaceDragClick(event: ReactMouseEvent<HTMLButtonElement>, workspaceId: string): boolean {
    if (workspaceDragClickSuppressionRef.current !== workspaceId) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  useEffect(() => () => {
    workspaceDragCleanupRef.current?.();
    if (workspaceDragClickTimerRef.current !== null) window.clearTimeout(workspaceDragClickTimerRef.current);
    if (workspaceDropSettleFrameRef.current !== null) window.cancelAnimationFrame(workspaceDropSettleFrameRef.current);
  }, []);
  return { workspaceDragVisual, workspaceDropSettling, beginWorkspaceDrag, suppressWorkspaceDragClick };
}

function resolveWorkspaceDropTarget(slots: WorkspaceTabSlot[], workspaceId: string, offsetX: number): string | null {
  const draggedSlot = slots.find((slot) => slot.id === workspaceId);
  if (!draggedSlot) return null;
  const projectedCenter = draggedSlot.centerX + offsetX;
  const nearestSlot = slots.reduce((nearest, slot) => Math.abs(slot.centerX - projectedCenter) < Math.abs(nearest.centerX - projectedCenter) ? slot : nearest, draggedSlot);
  return nearestSlot.id === workspaceId ? null : nearestSlot.id;
}

function moveWorkspaceInOrder(order: string[], workspaceId: string, targetWorkspaceId: string): string[] {
  const from = order.indexOf(workspaceId);
  const to = order.indexOf(targetWorkspaceId);
  if (from < 0 || to < 0 || from === to) return order;
  const nextOrder = [...order];
  const [workspace] = nextOrder.splice(from, 1);
  nextOrder.splice(to, 0, workspace);
  return nextOrder;
}

