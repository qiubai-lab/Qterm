import { useEffect, useState } from "react";
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
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    // BFCache resumes must not leave a mounted UI referring to closed sessions.
    const leave = (event: PageTransitionEvent) => { if (!event.persisted) resetDemo(); };
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); resetDemo(); };
  }, []);
  function reset() { resetDemo(); setGeneration(value => value + 1); }
  return <AppThemeProvider><ThemedTitleTooltipProvider>
    <div className="demo-page">
      <nav className="demo-navigation" aria-label="站点导航"><a href={import.meta.env.BASE_URL}>← Qterm</a><span>在线体验</span><a href="https://github.com/qiubai-lab/Qterm/releases/latest" target="_blank" rel="noreferrer">下载桌面版 ↗</a></nav>
      <div className="demo-presentation"><WorkspaceProvider key={generation}><DemoWorkbench onReset={reset}/><TerminalExternalLinkConfirmationHost/></WorkspaceProvider></div>
    </div>
  </ThemedTitleTooltipProvider></AppThemeProvider>;
}

function resetDemo() { resetDemoSessions(); resetFeatureSessions(); resetDemoProjects(); resetDemoNetwork(); }
