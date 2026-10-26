import { useEffect, useLayoutEffect, useRef } from "react";
import { subscribeNativeWebTabClose } from "../lib/tauri/blockClose";
import { nativeSurfaceBlockId } from "./surface/nativeSurfaceCoordinator";

interface Options { blockId?: string; active: boolean; visible: boolean; close: () => void }

/** Only the active browser owns Ctrl+W; tab state stays in WebTabs. */
export function useWebTabCloseShortcut({ blockId, active, visible, close }: Options) {
  const latest = useRef({ blockId, active, visible, close });
  useLayoutEffect(() => { latest.current = { blockId, active, visible, close }; });
  useEffect(() => {
    const allowed = () => latest.current.active && latest.current.visible && !document.hidden &&
      !document.querySelector('[role="dialog"], [role="menu"], .terminal-lock-screen');
    const onKeyDown = (event: KeyboardEvent) => {
      const keyW = event.code === "KeyW" || event.key.toLowerCase() === "w";
      if (!keyW || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !allowed()) return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat && !event.isComposing) latest.current.close();
    };
    const unsubscribe = subscribeNativeWebTabClose(source => {
      if (source !== null && allowed() && latest.current.blockId && nativeSurfaceBlockId(source) === latest.current.blockId) latest.current.close();
    });
    window.addEventListener("keydown", onKeyDown, true);
    return () => { window.removeEventListener("keydown", onKeyDown, true); unsubscribe(); };
  }, []);
}
