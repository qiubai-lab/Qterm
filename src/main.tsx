import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { bootstrapAppTheme } from "./app/theme/AppThemeProvider";

document.documentElement.dataset.theme ??= "dark";

void bootstrapAppTheme().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
