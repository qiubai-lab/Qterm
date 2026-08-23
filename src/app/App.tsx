import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { WorkspaceShell } from "../workspace/WorkspaceShell";
import "./app.css";
import { AppThemeProvider } from "./theme/AppThemeProvider";

export default function App() {
  return <AppThemeProvider><WorkspaceProvider><WorkspaceShell/></WorkspaceProvider></AppThemeProvider>;
}
