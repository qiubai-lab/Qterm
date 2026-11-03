import { ServerWorkbench } from "./ServerWorkbench";
import { useState } from "react";
import { AppThemeProvider } from "../app/theme/AppThemeProvider";
import { Button } from "../components/Button";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";
import { ThemedTitleTooltipProvider } from "../components/ThemedTitleTooltipProvider";
import { useServerAccess } from "./useServerAccess";
import { AccessTakeoverDialog } from "./AccessTakeoverDialog";
import { AccessReplacedDialog } from "./AccessReplacedDialog";
import { useBrowserContextMenuGuard } from "../app/useBrowserContextMenuGuard";
import "../app/app.css";
import "./server.css";

export function ServerApp({renderChrome}: {renderChrome?: (access: ReturnType<typeof useServerAccess>) => React.ReactNode} = {}) {
  useBrowserContextMenuGuard();
  const access = useServerAccess();
  const replaced = access.phase === "replaced";
  const disconnected = access.phase === "disconnected" || access.phase === "reconnecting";
  const interrupted = replaced || disconnected;
  const authenticated = access.phase === "workspace" || interrupted;
  const checking = access.phase === "checking";
  const [password,setPassword] = useState("");
  const {busy,error} = access;
  async function login(event: React.FormEvent) {
    event.preventDefault();const submitted=password;setPassword("");await access.login(submitted);
  }
  return <AppThemeProvider key={authenticated ? "workspace" : "login"}><ThemedTitleTooltipProvider>
    {renderChrome?.(access)}
    {authenticated ? <div className="server-workspace" inert={interrupted}><ServerWorkbench onLogout={access.logout}/></div> :
      <main className="server-login"><form className="server-login-card" onSubmit={event => void login(event)}>
        <div className="server-wordmark">›_ <strong>Qterm</strong><span>Server</span></div>
        <h1>连接你的工作空间</h1><p>登录后使用服务主机终端、远程连接与文件管理。</p>
        <label><RequiredFieldLabel>访问密码</RequiredFieldLabel><input aria-label="访问密码" type="password" autoComplete="current-password" value={password} required disabled={checking || busy} onChange={event => setPassword(event.target.value)}/></label>
        <p className="server-status" role="status">{checking ? error || "正在恢复连接…" : error}</p>
        <Button type="submit" variant="primary" loading={busy} disabled={checking}>{busy ? "正在登录…" : "登录"}</Button>
        <p className="server-login-note">单用户实例 · 关闭页面后后台任务继续运行</p>
      </form></main>}
    {access.phase === "occupied" && <AccessTakeoverDialog busy={busy} onCancel={access.cancel} onTakeover={()=>void access.takeover()}/>}
    {interrupted && <AccessReplacedDialog reason={replaced ? "replaced" : "disconnected"} reconnecting={access.phase === "reconnecting"} onConfirm={access.acknowledgeReplaced}/>}
  </ThemedTitleTooltipProvider></AppThemeProvider>;
}
