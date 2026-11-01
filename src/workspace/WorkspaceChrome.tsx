import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { closeCurrentWindow, currentDesktopPlatform, isCurrentWindowAlwaysOnTop, minimizeCurrentWindow, setCurrentWindowAlwaysOnTop, startDraggingCurrentWindow, toggleMaximizeCurrentWindow } from "../lib/tauri/window";
import { WorkspaceLogoutControl } from "./WorkspaceLogoutControl";
const TITLEBAR_DRAG_THRESHOLD_PX = 5;
const TITLEBAR_DOUBLE_CLICK_DISTANCE_PX = 5;
const TITLEBAR_DOUBLE_CLICK_MS = 350;
interface TitlebarGesture { pointerId: number; x: number; y: number }
interface TitlebarClick { at: number; x: number; y: number }

/** Shared chrome; only native window operations and browser logout differ. */
export function WorkspaceChrome({ children, onLogout }: { children: ReactNode; onLogout?: () => Promise<void> }) {
  const usesNativeWindowControls = currentDesktopPlatform() === "macos";
  const [windowAlwaysOnTop, setWindowAlwaysOnTop] = useState(false);
  const [windowPinBusy, setWindowPinBusy] = useState(false);
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

  async function toggleWindowAlwaysOnTop() {
    if (windowPinBusy) return;
    const next = !windowAlwaysOnTop;
    setWindowPinBusy(true);
    try {
      await setCurrentWindowAlwaysOnTop(next);
      setWindowAlwaysOnTop(next);
    } catch {
      // Keep the visible state aligned with the last confirmed native state.
    } finally {
      setWindowPinBusy(false);
    }
  }

  useEffect(() => () => {
    titlebarGestureCleanupRef.current?.();
  }, []);

  useEffect(() => {
    let disposed = false;
    void isCurrentWindowAlwaysOnTop().then((value) => {
      if (!disposed) setWindowAlwaysOnTop(value);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, []);

  return <header className="app-chrome" onPointerDown={onLogout ? undefined : beginWindowDrag}>
    <div className="app-brand" aria-label="Qterm"><Icon name="terminal" size={15}/><span>Qterm</span></div>
    {children}
    {onLogout ? <WorkspaceLogoutControl onLogout={onLogout}/> : <>
      <div className="window-controls" aria-label="窗口控制">
        <button className="window-pin" aria-label={windowAlwaysOnTop ? "取消窗口置顶" : "置顶窗口"} aria-pressed={windowAlwaysOnTop} aria-busy={windowPinBusy || undefined} title={windowAlwaysOnTop ? "取消置顶" : "置顶窗口"} disabled={windowPinBusy} onClick={() => void toggleWindowAlwaysOnTop()}><Icon name="pin" size={14}/></button>
        {!usesNativeWindowControls && <>
          <button aria-label="最小化窗口" title="最小化" onClick={() => void minimizeCurrentWindow()}><Icon name="windowMinimize" size={14}/></button>
          <button aria-label="最大化或还原窗口" title="最大化或还原" onClick={() => void toggleMaximizeCurrentWindow()}><Icon name="windowMaximize" size={12}/></button>
          <button className="window-close" aria-label="关闭窗口" title="关闭" onClick={() => void closeCurrentWindow()}><Icon name="close" size={14}/></button>
        </>}
      </div>
    </>}
  </header>;
}

function isInteractiveTitlebarTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest("button,input,[data-workspace-id]"));
}

