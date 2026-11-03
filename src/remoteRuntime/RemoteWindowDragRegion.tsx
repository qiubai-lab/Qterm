import { currentDesktopPlatform } from "../lib/tauri/window";
import { useWindowTitlebar } from "../workspace/useWindowTitlebar";

/** Authentication/startup screens have no WorkspaceChrome to own window gestures. */
export function RemoteWindowDragRegion() {
  const beginWindowDrag = useWindowTitlebar();
  return <div className="runtime-window-drag-region" data-platform={currentDesktopPlatform()} onPointerDown={beginWindowDrag}/>;
}
