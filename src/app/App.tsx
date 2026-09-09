import { TerminalNotificationProvider } from "../terminal/notifications/TerminalNotificationProvider";
import { TerminalExternalLinkConfirmationHost } from "../terminal/TerminalExternalLinkConfirmation";
import { ThemedTitleTooltipProvider } from "../components/ThemedTitleTooltipProvider";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { WorkspaceShell } from "../workspace/WorkspaceShell";
import "./app.css";
import { AppThemeProvider } from "./theme/AppThemeProvider";
import { useBrowserContextMenuGuard } from "./useBrowserContextMenuGuard";

export default function App() {
  useBrowserContextMenuGuard();
  return <AppThemeProvider><ThemedTitleTooltipProvider><WorkspaceProvider><TerminalNotificationProvider><WorkspaceShell/><TerminalExternalLinkConfirmationHost/></TerminalNotificationProvider></WorkspaceProvider></ThemedTitleTooltipProvider></AppThemeProvider>;
}
