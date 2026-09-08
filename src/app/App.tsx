import { TerminalNotificationProvider } from "../terminal/notifications/TerminalNotificationProvider";
import { TerminalExternalLinkConfirmationHost } from "../terminal/TerminalExternalLinkConfirmation";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { WorkspaceShell } from "../workspace/WorkspaceShell";
import "./app.css";
import { AppThemeProvider } from "./theme/AppThemeProvider";
import { useBrowserContextMenuGuard } from "./useBrowserContextMenuGuard";

export default function App() {
  useBrowserContextMenuGuard();
  return <AppThemeProvider><WorkspaceProvider><TerminalNotificationProvider><WorkspaceShell/><TerminalExternalLinkConfirmationHost/></TerminalNotificationProvider></WorkspaceProvider></AppThemeProvider>;
}
