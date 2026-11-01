import { ServerRuntimeRestore } from "./ServerRuntimeRestore";
import { useEffect, useState } from "react";
import { AppThemeProvider, bootstrapAppTheme } from "../app/theme/AppThemeProvider";
import { Button } from "../components/Button";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";
import { ThemedTitleTooltipProvider } from "../components/ThemedTitleTooltipProvider";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { WorkspaceTerminalLinkHost } from "../workspace/WorkspaceTerminalLinkHost";
import { api, AUTH_EXPIRED, message } from "./http";
import { closeAllSessions } from "./sessionTransport";
import { WorkspaceShell } from "../workspace/WorkspaceShell";
import { OnboardingProvider } from "../onboarding/OnboardingProvider";
import { TerminalNotificationProvider } from "../terminal/notifications/TerminalNotificationProvider";
import { useBrowserContextMenuGuard } from "../app/useBrowserContextMenuGuard";
import "../app/app.css";
import "./server.css";

export function ServerApp() {
  useBrowserContextMenuGuard();
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const expire = () => { closeAllSessions(); setAuthenticated(false); };
    window.addEventListener(AUTH_EXPIRED, expire);
    void api("/auth").then(async () => { await bootstrapAppTheme(); if (active) setAuthenticated(true); }, () => undefined).finally(() => { if (active) setChecking(false); });
    const restorePage = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", restorePage);
    window.addEventListener("pagehide", closeAllSessions);
    return () => { active = false; window.removeEventListener(AUTH_EXPIRED, expire); window.removeEventListener("pagehide", closeAllSessions); window.removeEventListener("pageshow", restorePage); closeAllSessions(); };
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const submitted = password; setPassword("");
    try { await api("/login", "POST", { password: submitted }); await bootstrapAppTheme(); setAuthenticated(true); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function logout() {
    await api("/logout", "POST");
    closeAllSessions(); setAuthenticated(false);
  }
  return <AppThemeProvider key={authenticated ? "workspace" : "login"}><ThemedTitleTooltipProvider>
    {authenticated ? <WorkspaceProvider><OnboardingProvider mode="desktop"><TerminalNotificationProvider><WorkspaceShell onLogout={logout}/><ServerRuntimeRestore/><WorkspaceTerminalLinkHost/></TerminalNotificationProvider></OnboardingProvider></WorkspaceProvider> :
      <main className="server-login"><form className="server-login-card" onSubmit={event => void login(event)}>
        <div className="server-wordmark">›_ <strong>Qterm</strong><span>Server</span></div>
        <h1>连接你的工作空间</h1><p>登录后使用服务主机终端、远程连接与文件管理。</p>
        <label><RequiredFieldLabel>访问密码</RequiredFieldLabel><input aria-label="访问密码" type="password" autoComplete="current-password" value={password} required disabled={checking || busy} onChange={event => setPassword(event.target.value)}/></label>
        <p className="server-status" role="status">{checking ? "正在检查登录状态…" : error}</p>
        <Button type="submit" variant="primary" loading={busy} disabled={checking}>{busy ? "正在登录…" : "登录"}</Button>
        <p className="server-login-note">单用户实例 · 关闭页面后后台任务继续运行</p>
      </form></main>}
  </ThemedTitleTooltipProvider></AppThemeProvider>;
}
