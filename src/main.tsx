import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { bootstrapAppTheme } from "./app/theme/AppThemeProvider";

import { bootstrapWebCapabilities } from "./lib/tauri/webCapabilities";

document.documentElement.dataset.theme ??= "dark";

void Promise.allSettled([bootstrapAppTheme(), bootstrapWebCapabilities()]).finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
