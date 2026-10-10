import { useEffect, useState } from "react";
import { configureSync, getSync, runSync, type SyncSettings, type SyncView } from "../../../lib/tauri/sync";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { RequiredFieldLabel } from "../../RequiredFieldLabel";
import { DialogFrame } from "../DialogFrame";
import "./syncSettings.css";

const defaults: SyncSettings = { enabled: false, serverUrl: "", allowInsecureHttp: false };
const settingsOf = ({ enabled, serverUrl, allowInsecureHttp }: SyncSettings): SyncSettings => ({ enabled, serverUrl, allowInsecureHttp });

export function SyncSettingsPanel() {
  const [view, setView] = useState<SyncView | null>(null);
  const [draft, setDraft] = useState(defaults);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<"local" | "remote" | null>(null);
  useEffect(() => {
    let active = true;
    void getSync().then((value) => { if (active) { setView(value); setDraft(settingsOf(value)); } })
      .catch(() => { if (active) setError("无法读取同步设置，请确认桌面服务可用。"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (busy) return;
    let active = true;
    let pending = false;
    const timer = window.setInterval(() => {
      if (pending) return;
      pending = true;
      void getSync().then((value) => { if (active) setView(value); }).catch(() => undefined)
        .finally(() => { pending = false; });
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [busy]);

  const dirty = view !== null && (draft.enabled !== view.enabled || draft.serverUrl !== view.serverUrl
    || draft.allowInsecureHttp !== view.allowInsecureHttp || token.length > 0);

  async function save() {
    setBusy(true); setError("");
    try {
      const value = await configureSync({ ...draft, token: token || null });
      setView(value); setDraft(settingsOf(value)); setToken("");
    } catch (reason) { setError(typeof reason === "string" ? reason : "同步设置保存失败"); }
    finally { setBusy(false); }
  }
  async function synchronize(resolution: "local" | "remote" | null = null) {
    setBusy(true); setError(""); setChoice(null);
    try { setView(await runSync(resolution ? view?.status.conflictToken ?? null : null, resolution)); }
    catch (reason) { setError(typeof reason === "string" ? reason : "无法执行同步"); }
    finally { setBusy(false); }
  }

  return <div className="sync-settings">
    <div className="settings-content-scroll sync-settings-scroll">
    <div className="settings-section-heading"><h3 id="sync-settings-title">同步</h3><p>通过自托管服务在设备间同步连接配置。</p></div>
    <section className="settings-directory-card sync-connection-card" aria-label="同步服务配置">
    <div className="settings-card-heading">
      <span><strong>启用连接同步</strong><small>启用后合并两端连接，每 30 秒自动同步。</small></span>
      <label className="settings-switch"><input className="settings-switch-input" type="checkbox" role="switch" aria-label="启用连接同步" checked={draft.enabled} disabled={!view || busy} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}/><span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb"/></span></label>
    </div>
    <form id="sync-settings-form" className="sync-settings-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="sync-field"><RequiredFieldLabel>服务器地址</RequiredFieldLabel><input aria-label="服务器地址" type="url" required={draft.enabled} disabled={!view || busy} value={draft.serverUrl} placeholder="https://sync.example.com" autoComplete="off" onChange={(event) => setDraft({ ...draft, serverUrl: event.target.value })}/></label>
      <label className="sync-field"><RequiredFieldLabel>Token</RequiredFieldLabel><input aria-label="同步 Token" type="password" required={draft.enabled && (!view?.hasToken || draft.serverUrl !== view.serverUrl)} disabled={!view || busy} value={token} placeholder={view?.hasToken ? "已安全保存；留空保留，输入以替换" : "输入服务访问 Token"} autoComplete="new-password" spellCheck={false} onChange={(event) => setToken(event.target.value)}/></label>
      <label className="sync-field sync-http-option"><span>本地网络</span><span className="sync-http-control"><input type="checkbox" aria-label="允许 HTTP" checked={draft.allowInsecureHttp} disabled={!view || busy} onChange={(event) => setDraft({ ...draft, allowInsecureHttp: event.target.checked })}/><span>允许 HTTP</span><small>未加密</small></span></label>
    </form>
    </section>
    <section className="settings-directory-card sync-scope-card" aria-label="同步范围">
      <div className="sync-scope-row">
        <span className="sync-scope-label"><Icon name="sync" size={12}/><strong>同步范围</strong></span>
        <ul className="sync-scope-tags" aria-label="同步内容"><li>连接</li><li>分组</li><li>跳板机顺序</li></ul>
      </div>
      <div className="sync-scope-row">
        <span className="sync-scope-label"><Icon name="lock" size={12}/><strong>留在本机</strong></span>
        <p className="sync-scope-local"><span>密码与私钥</span><small>新设备需绑定凭证</small></p>
      </div>
    </section>
    {view && view.status.conflicts.length > 0 && <div className="sync-conflicts" role="region" aria-label="同步冲突">
      <strong>{view.status.conflicts.length} 个条目存在冲突</strong>
      <ul>{view.status.conflicts.map((item) => <li key={`${item.kind}:${item.id}`}>{item.kind === "group" ? "分组" : "连接"}：{item.name}</li>)}</ul>
      <div className="sync-conflict-actions"><Button disabled={busy || dirty} onClick={() => setChoice("local")}>冲突保留本机</Button><Button disabled={busy || dirty} onClick={() => setChoice("remote")}>冲突保留服务器</Button></div>
    </div>}
    </div>
    <footer className="dialog-actions settings-actions">
    <div className="settings-feedback-slot sync-feedback"><p className="settings-message" role={error ? "alert" : "status"}>{error || view?.status.message || (view ? "同步未启用" : "正在读取设置…")}</p></div>
    <div className="sync-settings-actions"><Button disabled={!view?.enabled || busy || dirty} onClick={() => void synchronize()}>立即同步</Button><Button type="submit" form="sync-settings-form" variant="primary" loading={busy} disabled={!view || busy || !dirty}>保存设置</Button></div>
    </footer>
    {choice && <DialogFrame compact title="处理同步冲突" subtitle="仅处理当前已列出的冲突条目" onClose={() => setChoice(null)}>
      <p className="dialog-note">确认对所有冲突条目采用{choice === "local" ? "本机" : "服务器"}版本？另一端对这些条目的修改或删除将被替代，无冲突的条目继续合并。</p>
      <footer className="dialog-actions"><Button variant="danger" onClick={() => setChoice(null)}>取消</Button><Button variant="primary" onClick={() => void synchronize(choice)}>确认处理</Button></footer>
    </DialogFrame>}
  </div>;
}
