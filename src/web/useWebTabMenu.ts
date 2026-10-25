import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useNativeWebDismiss } from "../components/useNativeWebDismiss";

/** Owns menu intent and native-focus dismissal, without selecting or closing pages. */
export function useWebTabMenu(ids: string[], visible: boolean) {
  const [menu, setMenu] = useState<{ anchorId: string; x: number; y: number } | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  if (menu && (!visible || !ids.includes(menu.anchorId))) setMenu(null);
  const dismiss = useCallback((restore = true) => {
    setMenu(null);
    if (restore) anchor.current?.focus({ preventScroll: true });
  }, []);
  const open = (target: EventTarget, x: number, y: number) => {
    if (!visible || !(target instanceof Element) || document.querySelector('[aria-modal="true"]')) return;
    const tab = target.closest<HTMLElement>(".web-tab[data-tab-id]");
    if (!tab?.dataset.tabId || !ids.includes(tab.dataset.tabId)) return;
    anchor.current = tab.querySelector('[role="tab"]');
    setMenu({ anchorId: tab.dataset.tabId, x, y });
  };
  useNativeWebDismiss(Boolean(menu), () => dismiss(false));
  return { menu, dismiss, events: {
    onContextMenu: (event: MouseEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); open(event.target, event.clientX, event.clientY); },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
      event.preventDefault(); event.stopPropagation();
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      open(event.target, rect.left, rect.bottom + 4);
    },
  } };
}
