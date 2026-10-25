import { OnboardingProvider } from "../onboarding/OnboardingProvider";
import { TerminalNotificationProvider } from "../terminal/notifications/TerminalNotificationProvider";
import { WorkspaceTerminalLinkHost } from "../workspace/WorkspaceTerminalLinkHost";
import { ThemedTitleTooltipProvider } from "../components/ThemedTitleTooltipProvider";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { WorkspaceShell } from "../workspace/WorkspaceShell";
import "./app.css";
import { AppThemeProvider } from "./theme/AppThemeProvider";
import { useBrowserContextMenuGuard } from "./useBrowserContextMenuGuard";

export default function App() {
  useBrowserContextMenuGuard();
  return <AppThemeProvider><ThemedTitleTooltipProvider><WorkspaceProvider><OnboardingProvider mode="desktop"><TerminalNotificationProvider><WorkspaceShell/><WorkspaceTerminalLinkHost/></TerminalNotificationProvider></OnboardingProvider></WorkspaceProvider></ThemedTitleTooltipProvider></AppThemeProvider>;
}
