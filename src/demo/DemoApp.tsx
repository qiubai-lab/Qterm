import { OnboardingProvider } from "../onboarding/OnboardingProvider";
import { useEffect } from "react";
import { AppThemeProvider } from "../app/theme/AppThemeProvider";
import { ThemedTitleTooltipProvider } from "../components/ThemedTitleTooltipProvider";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { TerminalExternalLinkConfirmationHost } from "../terminal/TerminalExternalLinkConfirmation";
import { DemoWorkbench } from "./DemoWorkbench";
import { resetDemoSessions } from "./sessionRegistry";
import { resetDemoProjects } from "./demoProject";
import { resetFeatureSessions } from "./featureSessions";
import { resetDemoNetwork } from "./services/network";
import "../app/app.css";
import "./demo.css";

export default function DemoApp() {
  useEffect(() => {
    // BFCache resumes must not leave a mounted UI referring to closed sessions.
    const leave = (event: PageTransitionEvent) => { if (!event.persisted) resetDemo(); };
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); resetDemo(); };
  }, []);
  return <AppThemeProvider><ThemedTitleTooltipProvider><WorkspaceProvider><OnboardingProvider mode="demo">
    <div className="demo-page" data-demo-theme="cyberpunk">
      <nav className="demo-navigation" aria-label="站点导航"><div className="demo-brand"><a href={import.meta.env.BASE_URL} aria-label="返回 Qterm 首页"><span aria-hidden="true">›_</span> Qterm</a><span>在线体验</span></div><div className="demo-navigation-actions"><a href="https://github.com/qiubai-lab/Qterm/releases/latest" target="_blank" rel="noreferrer">下载桌面版 ↗</a></div></nav>
      <div className="demo-presentation"><DemoWorkbench/><TerminalExternalLinkConfirmationHost/></div>
    </div>
  </OnboardingProvider></WorkspaceProvider></ThemedTitleTooltipProvider></AppThemeProvider>;
}

function resetDemo() { resetDemoSessions(); resetFeatureSessions(); resetDemoProjects(); resetDemoNetwork(); }
