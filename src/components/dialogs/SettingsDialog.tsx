import { useEffect, useRef, useState } from "react";

import {
  getSettings,
  selectDataDirectory,
  updateDataDirectory,
  updateSecuritySettings,
  type GeneralSettings,
  type SecuritySettings,
} from "../../lib/tauri/settings";
import { Icon } from "../Icon";
import { DialogFrame } from "./DialogFrame";

const durations = [300, 900, 1800, 3600, 7200, 14400, 28800, 86400];
type SettingsCategory = "general" | "security";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<SettingsCategory>("general");
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [dataDirectory, setDataDirectory] = useState("");
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const savedTimer = useRef<number | null>(null);

  useEffect(() => {
    void getSettings().then((snapshot) => {
      applySnapshot(snapshot);
      if (snapshot.warning) setError("设置文件异常，当前已采用安全默认值且不会覆盖原文件。");
      if (snapshot.general.restartRequired) setStatus("连接与凭证存储位置将在重启 Qterm 后生效。");
    }).catch((reason) => setError(errorMessage(reason)));
    return () => { if (savedTimer.current !== null) window.clearTimeout(savedTimer.current); };
  }, []);

  function applySnapshot(snapshot: { general: GeneralSettings; security: SecuritySettings }) {
    setGeneral(snapshot.general);
    setDataDirectory(snapshot.general.dataDirectory);
    setSecurity(snapshot.security);
  }

  async function chooseDirectory() {
    if (busy) return;
    setError("");
    try {
      const selected = await selectDataDirectory(dataDirectory);
      if (selected) setDataDirectory(selected);
    } catch (reason) { setError(errorMessage(reason)); }
  }

  async function save() {
    if (!general || !security || busy) return;
    setBusy(true); setSaved(false); setError(""); setStatus("");
    try {
      const snapshot = category === "general"
        ? await updateDataDirectory({ path: dataDirectory })
        : await updateSecuritySettings(security);
      applySnapshot(snapshot);
      if (snapshot.general.restartRequired) {
        setStatus("已初始化所选目录。请手动迁移 connections.json、network-forwards.json 与 secrets.vault，重启 Qterm 后生效。");
      }
      setSaved(true);
      savedTimer.current = window.setTimeout(() => setSaved(false), 1400);
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  return <DialogFrame title="系统设置" subtitle="通用偏好与安全策略" className="settings-dialog" onClose={busy ? () => undefined : onClose}>
    <div className="settings-layout">
      <nav className="settings-sidebar" aria-label="设置分类">
        <span className="settings-sidebar-label">设置</span>
        <SettingsNavItem category="general" current={category} icon="settings" title="通用" subtitle="数据与存储" onSelect={setCategory}/>
        <SettingsNavItem category="security" current={category} icon="lock" title="安全" subtitle="凭证锁定" onSelect={setCategory}/>
      </nav>
      <section className="settings-content" aria-labelledby={`${category}-settings-title`}>
        <div className="settings-content-scroll">
          {category === "general" ? <>
            <div className="settings-section-heading"><h3 id="general-settings-title">通用</h3><p>管理连接配置、网络规则与加密凭证的可迁移存储位置。</p></div>
            {general ? <div className="settings-directory-card">
              <label htmlFor="settings-data-directory"><strong>连接、网络规则与凭证存储位置</strong><small>影响 connections.json、network-forwards.json 与 secrets.vault；留空或填写 ~/.qterm 将使用默认位置。</small></label>
              <div className="settings-path-control">
                <input id="settings-data-directory" aria-label="数据存储位置" value={dataDirectory} placeholder="~/.qterm" onChange={(event) => setDataDirectory(event.target.value)}/>
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void chooseDirectory()}>选择文件夹</button>
              </div>
              <div className="settings-directory-meta"><span>当前连接、网络规则与凭证位置</span><code>{general.activeDataDirectory}</code><button type="button" disabled={busy} onClick={() => setDataDirectory("~/.qterm")}>恢复默认</button></div>
            </div> : <p className="dialog-note">正在读取设置…</p>}
            <div className="settings-migration-callout">
              <strong>连接、网络规则与凭证需要手动迁移</strong>
              <p>Qterm 不会自动迁移或覆盖 connections.json、network-forwards.json 与 secrets.vault。known-hosts.json 与 workspaces.json 仍保存在系统默认位置，不受此设置影响。</p>
            </div>
          </> : <>
            <div className="settings-section-heading"><h3 id="security-settings-title">安全</h3><p>管理本机凭证库的自动锁定策略。</p></div>
            {security ? <div className="settings-rows">
              <div className="settings-row"><span><strong>Windows 锁屏后锁定凭证</strong><small>收到系统会话锁定事件时，立即清除运行时密钥。</small></span><SettingsSwitch label="Windows 锁屏后锁定凭证" checked={security.lockOnWindowsSessionLock} onChange={(checked) => setSecurity({ ...security, lockOnWindowsSessionLock: checked })}/></div>
              <div className="settings-row"><span><strong>定时锁定凭证</strong><small>从最近一次成功解锁或修改主密码开始计时，不因操作续期。</small></span><div className="settings-timeout-control" role="group" aria-label="定时锁定控制"><select aria-label="凭证锁定时长" disabled={security.autoLockAfterSeconds === null} value={security.autoLockAfterSeconds ?? 3600} onChange={(event) => setSecurity({ ...security, autoLockAfterSeconds: Number(event.target.value) })}>{durations.map((seconds) => <option value={seconds} key={seconds}>{durationLabel(seconds)}</option>)}</select><SettingsSwitch label="启用定时锁定凭证" checked={security.autoLockAfterSeconds !== null} onChange={(checked) => setSecurity({ ...security, autoLockAfterSeconds: checked ? 3600 : null })}/></div></div>
            </div> : <p className="dialog-note">正在读取设置…</p>}
          </>}
          {error && <p className="inline-message settings-message" role="alert">{error}</p>}
          {status && <p className="inline-message settings-status" role="status">{status}</p>}
        </div>
        <footer className="dialog-actions end settings-actions"><button className={`primary-button save-state-button${saved ? " saved" : ""}`} disabled={!general || !security || busy} onClick={() => void save()}>{busy ? "保存中…" : saved ? "✓ 已保存" : "保存设置"}</button></footer>
      </section>
    </div>
  </DialogFrame>;
}

function SettingsNavItem({ category, current, icon, title, subtitle, onSelect }: {
  category: SettingsCategory;
  current: SettingsCategory;
  icon: "settings" | "lock";
  title: string;
  subtitle: string;
  onSelect: (category: SettingsCategory) => void;
}) {
  const selected = category === current;
  return <button type="button" className={`settings-nav-item${selected ? " selected" : ""}`} aria-current={selected ? "page" : undefined} onClick={() => onSelect(category)}>
    <span className="settings-nav-icon"><Icon name={icon} size={14}/></span>
    <span><strong>{title}</strong><small>{subtitle}</small></span>
  </button>;
}

function SettingsSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="settings-switch">
    <input className="settings-switch-input" type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)}/>
    <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb"/></span>
  </label>;
}

function durationLabel(seconds: number) {
  if (seconds < 3600) return `${seconds / 60} 分钟`;
  return `${seconds / 3600} 小时`;
}

function errorMessage(error: unknown) { return typeof error === "object" && error && "message" in error ? String(error.message) : "设置保存失败"; }
