import { useEffect } from "react";

export function useBrowserContextMenuGuard() {
  useEffect(() => {
    const preventBrowserContextMenu = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-native-text-selection]")) return;
      event.preventDefault();
    };
    // CodeMirror ignores context-menu events cancelled during capture, so keep this as the final bubbling fallback.
    document.addEventListener("contextmenu", preventBrowserContextMenu);
    return () => document.removeEventListener("contextmenu", preventBrowserContextMenu);
  }, []);
}
