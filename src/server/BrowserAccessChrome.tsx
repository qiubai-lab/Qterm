import { useSyncExternalStore } from "react";
import { BrowserControls } from "../browser/BrowserControls";
import { useBrowserInterface } from "../browser/browserInterfaceContext";
import { dataPaused, subscribeDataAccess } from "./dataAccess";

/** Keep fullscreen exit reachable while login, lock or reconnect covers the workbench. */
export function BrowserAccessChrome({ workspace }: { workspace: boolean }) {
  const { enabled } = useBrowserInterface();
  const paused = useSyncExternalStore(subscribeDataAccess, dataPaused);
  if (!enabled || (workspace && !paused)) return null;
  return <div className="browser-access-chrome window-controls"><BrowserControls/></div>;
}
