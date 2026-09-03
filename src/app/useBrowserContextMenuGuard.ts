import { useEffect } from "react";

export function useBrowserContextMenuGuard() {
  useEffect(() => {
    const preventBrowserContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", preventBrowserContextMenu, true);
    return () => document.removeEventListener("contextmenu", preventBrowserContextMenu, true);
  }, []);
}
