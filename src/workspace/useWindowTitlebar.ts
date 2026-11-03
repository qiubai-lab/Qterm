import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { startDraggingCurrentWindow, toggleMaximizeCurrentWindow } from "../lib/tauri/window";

const TITLEBAR_DRAG_THRESHOLD_PX = 5;
const TITLEBAR_DOUBLE_CLICK_DISTANCE_PX = 5;
const TITLEBAR_DOUBLE_CLICK_MS = 350;
interface TitlebarGesture { pointerId: number; x: number; y: number }
interface TitlebarClick { at: number; x: number; y: number }

/** Shared desktop titlebar gesture, including click threshold and teardown. */
export function useWindowTitlebar() {
  const titlebarGestureRef = useRef<TitlebarGesture | null>(null);
  const titlebarGestureCleanupRef = useRef<(() => void) | null>(null);
  const titlebarLastClickRef = useRef<TitlebarClick | null>(null);
  function beginWindowDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if (isInteractiveTitlebarTarget(event.target)) {
      titlebarGestureCleanupRef.current?.();
      titlebarLastClickRef.current = null;
      return;
    }

    titlebarGestureCleanupRef.current?.();
    const now = Date.now();
    const lastClick = titlebarLastClickRef.current;
    const isDoubleClick = lastClick
      && now - lastClick.at <= TITLEBAR_DOUBLE_CLICK_MS
      && Math.hypot(event.clientX - lastClick.x, event.clientY - lastClick.y) <= TITLEBAR_DOUBLE_CLICK_DISTANCE_PX;
    if (isDoubleClick) {
      event.preventDefault();
      titlebarLastClickRef.current = null;
      void toggleMaximizeCurrentWindow();
      return;
    }
    if (lastClick && now - lastClick.at > TITLEBAR_DOUBLE_CLICK_MS) titlebarLastClickRef.current = null;

    titlebarGestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    const finish = () => {
      titlebarGestureRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      if (titlebarGestureCleanupRef.current === finish) titlebarGestureCleanupRef.current = null;
    };
    const move = (pointer: PointerEvent) => {
      const gesture = titlebarGestureRef.current;
      if (!gesture || pointer.pointerId !== gesture.pointerId) return;
      if (Math.hypot(pointer.clientX - gesture.x, pointer.clientY - gesture.y) < TITLEBAR_DRAG_THRESHOLD_PX) return;
      titlebarLastClickRef.current = null;
      finish();
      void startDraggingCurrentWindow();
    };
    const end = (pointer: PointerEvent) => {
      const gesture = titlebarGestureRef.current;
      if (!gesture || pointer.pointerId !== gesture.pointerId) return;
      finish();
      titlebarLastClickRef.current = { at: Date.now(), x: pointer.clientX, y: pointer.clientY };
    };
    const cancel = (pointer: PointerEvent) => {
      if (pointer.pointerId !== titlebarGestureRef.current?.pointerId) return;
      finish();
      titlebarLastClickRef.current = null;
    };
    titlebarGestureCleanupRef.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
  }

  useEffect(() => () => {
    titlebarGestureCleanupRef.current?.();
  }, []);

  return beginWindowDrag;
}

function isInteractiveTitlebarTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest("button,input,[data-workspace-id]"));
}

