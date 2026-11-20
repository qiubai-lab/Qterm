import "./remoteRuntime/desktop/nativeFrame";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { selectedRuntime } from "./remoteRuntime/selection";
import { bootstrapRemoteMember } from "./remoteRuntime/desktop/bootstrap";
import { RemoteMember } from "./remoteRuntime/desktop/RemoteMember";
import { bootstrapAppTheme } from "./app/theme/AppThemeProvider";

import { bootstrapWebCapabilities } from "./lib/tauri/webCapabilities";

document.documentElement.dataset.theme ??= "dark";

if (selectedRuntime) bootstrapRemoteMember();
void Promise.allSettled(selectedRuntime ? [] : [bootstrapAppTheme(), bootstrapWebCapabilities()]).finally(() => {
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  if (selectedRuntime) window.addEventListener("pagehide", () => root.unmount(), { once: true });
  root.render(
    <React.StrictMode>
      {selectedRuntime ? <RemoteMember/> : <App />}
    </React.StrictMode>,
  );
});
