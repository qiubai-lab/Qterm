import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { WorkspaceShell } from "../workspace/WorkspaceShell";
import "./app.css";
import { AppThemeProvider } from "./theme/AppThemeProvider";
import { useBrowserContextMenuGuard } from "./useBrowserContextMenuGuard";

export default function App() {
  useBrowserContextMenuGuard();
  return <AppThemeProvider><WorkspaceProvider><WorkspaceShell/></WorkspaceProvider></AppThemeProvider>;
}
