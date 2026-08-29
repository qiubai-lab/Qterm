import { useCallback, useEffect, useRef, useState } from "react";

import {
  getSettings,
  selectConfigurationDirectory,
  updateAppearanceSettings,
  updateConfigurationDirectory,
  updateSecuritySettings,
  updateTerminalSettings,
  type AppearanceSettings,
  type GeneralSettings,
  type SecuritySettings,
  type TerminalSettings,
} from "../../lib/tauri/settings";
import { useAppTheme } from "../../app/theme/AppThemeProvider";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { ConfigurationDirectorySetting } from "./ConfigurationDirectorySetting";
import { ConfigurationPaths } from "./ConfigurationPaths";
import { DialogFrame } from "./DialogFrame";

const credentialDurations = [300, 900, 1800, 3600, 7200, 14400, 28800, 86400];
const terminalIdleDurations = [300, 900, 1800, 3600, 7200];
type SettingsCategory = "general" | "appearance" | "security" | "advanced";

export function SettingsDialog({ onClose, onSecuritySettingsChanged, onTerminalSettingsChanged }: { onClose: () => void; onSecuritySettingsChanged?: (settings: SecuritySettings) => void; onTerminalSettingsChanged?: (settings: TerminalSettings) => void }) {
  const { persistedTheme, previewTheme, commitTheme, restoreTheme } = useAppTheme();
  const [category, setCategory] = useState<SettingsCategory>("general");
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [configurationDirectory, setConfigurationDirectory] = useState("");
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [appearance, setAppearance] = useState<AppearanceSettings | null>(null);
  const [terminal, setTerminal] = useState<TerminalSettings | null>(null);
  const [confirmRemoteIntegration, setConfirmRemoteIntegration] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const savedTimer = useRef<number | null>(null);

  const applySnapshot = useCallback((snapshot: { general: GeneralSettings; security: SecuritySettings; appearance: AppearanceSettings; terminal: TerminalSettings }, preserveDirectoryDraft = false, preserveAppearanceDraft = false) => {
    setGeneral(snapshot.general);
    if (!preserveDirectoryDraft) setConfigurationDirectory(snapshot.general.rootDirectory);
    setSecurity(snapshot.security);
    setTerminal(snapshot.terminal);
    if (!preserveAppearanceDraft) {
      setAppearance(snapshot.appearance);
      commitTheme(snapshot.appearance.theme);
    }
  }, [commitTheme]);

  useEffect(() => {
    void getSettings().then((snapshot) => {
      applySnapshot(snapshot);
      if (snapshot.warning) setError("设置文件异常，当前已采用安全默认值且不会覆盖原文件。");
    }).catch((reason) => setError(errorMessage(reason)));
    return () => { if (savedTimer.current !== null) window.clearTimeout(savedTimer.current); };
  }, [applySnapshot]);

  async function save() {
    if (!security || !general || !appearance || busy || category === "advanced") return;
    setBusy(true); setSaved(false); setError("");
    try {
      const snapshot = category === "general"
        ? await updateConfigurationDirectory({ path: configurationDirectory })
        : category === "security"
          ? await updateSecuritySettings(security)
          : await updateAppearanceSettings(appearance);
      applySnapshot(snapshot, category === "security" || category === "appearance", category !== "appearance");
      if (category === "security") onSecuritySettingsChanged?.(snapshot.security);
      setSaved(true);
      savedTimer.current = window.setTimeout(() => setSaved(false), 1400);
    } catch (reason) {
      if (category === "appearance") {
        restoreTheme();
        setAppearance({ theme: persistedTheme });
      }
      setError(errorMessage(reason));
    }
    finally { setBusy(false); }
  }

  async function chooseConfigurationDirectory() {
    if (busy) return;
    try {
      const selected = await selectConfigurationDirectory(configurationDirectory);
      if (selected) setConfigurationDirectory(selected);
    } catch (reason) { setError(errorMessage(reason)); }
  }

  function close() {
    restoreTheme();
    onClose();
  }

  function chooseTheme(theme: AppearanceSettings["theme"]) {
    setAppearance({ theme });
    previewTheme(theme);
  }

  async function persistRemoteShellIntegration(enabled: boolean) {
    if (!terminal || busy) return;
    setBusy(true); setSaved(false); setError("");
    try {
      const snapshot = await updateTerminalSettings({ remoteShellIntegrationEnabled: enabled });
      applySnapshot(snapshot, true, true);
      onTerminalSettingsChanged?.(snapshot.terminal);
      setSaved(true);
      savedTimer.current = window.setTimeout(() => setSaved(false), 1400);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function changeRemoteShellIntegration(enabled: boolean) {
    if (enabled) {
      setConfirmRemoteIntegration(true);
      return;
    }
    void persistRemoteShellIntegration(false);
  }

  function selectCategory(nextCategory: SettingsCategory) {
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    setSaved(false);
    setCategory(nextCategory);
  }

  return <><DialogFrame title="系统设置" subtitle="通用偏好、外观、安全与高级功能" className="settings-dialog" onClose={busy ? () => undefined : close}>
    <div className="settings-layout">
      <nav className="settings-sidebar" aria-label="设置分类">
        <span className="settings-sidebar-label">设置</span>
        <SettingsNavItem category="general" current={category} icon="settings" title="通用" subtitle="数据与存储" onSelect={selectCategory}/>
        <SettingsNavItem category="appearance" current={category} icon="eye" title="外观" subtitle="界面主题" onSelect={selectCategory}/>
        <SettingsNavItem category="security" current={category} icon="lock" title="安全" subtitle="凭证与终端锁定" onSelect={selectCategory}/>
        <SettingsNavItem category="advanced" current={category} icon="terminal" title="高级" subtitle="终端集成" onSelect={selectCategory}/>
      </nav>
      <section className="settings-content" aria-labelledby={`${category}-settings-title`}>
        <div className="settings-content-scroll">
          {category === "general" ? <div className="settings-general-view">
            <div className="settings-section-heading"><h3 id="general-settings-title">通用</h3><p>配置 Qterm 数据根目录与存储路径。</p></div>
            {general ? <div className="settings-general-stack">
              <ConfigurationDirectorySetting
                value={configurationDirectory}
                disabled={busy}
                onChoose={() => void chooseConfigurationDirectory()}
                onReset={() => setConfigurationDirectory("~/.qterm")}
              />
              <div className="settings-storage-note" role="note"><Icon name="help" size={12}/><span>切换目录不会迁移或覆盖旧文件</span></div>
              <ConfigurationPaths rootDirectory={configurationDirectory || "~/.qterm"}/>
            </div> : <p className="dialog-note">正在读取设置…</p>}
          </div> : category === "appearance" ? <div className="settings-appearance-view">
            <div className="settings-section-heading"><h3 id="appearance-settings-title">外观</h3><p>选择 Qterm 的内置界面主题。</p></div>
            {appearance ? <fieldset className="settings-theme-picker" role="radiogroup" aria-label="界面主题">
              <legend>主题预设</legend>
              <ThemeOption theme="dark" current={appearance.theme} title="深色" description="当前默认的深色工作台" onSelect={chooseTheme}/>
              <ThemeOption theme="light" current={appearance.theme} title="亮色" description="适合明亮环境的浅色工作台" onSelect={chooseTheme}/>
              <ThemeOption theme="cyberpunk" current={appearance.theme} title="赛博霓虹" description="亮黄重点与青色状态的夜间工作台" onSelect={chooseTheme}/>
            </fieldset> : <p className="dialog-note">正在读取设置…</p>}
          </div> : category === "security" ? <>
            <div className="settings-section-heading"><h3 id="security-settings-title">安全</h3><p>管理凭证库有效期与终端空闲锁定策略。</p></div>
            {security ? <div className="settings-rows">
              <div className="settings-row"><span><strong>凭证库有效期</strong><small>从最近一次成功解锁或修改主密码开始计时，普通操作不会延长有效期。</small></span><div className="settings-timeout-control" role="group" aria-label="凭证库有效期控制"><select aria-label="凭证库有效期" disabled={security.credentialAutoLockAfterSeconds === null} value={security.credentialAutoLockAfterSeconds ?? 3600} onChange={(event) => setSecurity({ ...security, credentialAutoLockAfterSeconds: Number(event.target.value) })}>{credentialDurations.map((seconds) => <option value={seconds} key={seconds}>{durationLabel(seconds)}</option>)}</select><SettingsSwitch label="启用凭证库有效期" checked={security.credentialAutoLockAfterSeconds !== null} onChange={(checked) => setSecurity({ ...security, credentialAutoLockAfterSeconds: checked ? 3600 : null })}/></div></div>
              <div className="settings-row"><span><strong>无操作后锁定终端</strong><small>键盘、指针或滚轮无操作达到设定时长后，锁定终端和凭证；后台会话继续运行。</small></span><div className="settings-timeout-control" role="group" aria-label="终端空闲锁定控制"><select aria-label="终端空闲时长" disabled={security.terminalAutoLockAfterSeconds === null} value={security.terminalAutoLockAfterSeconds ?? 900} onChange={(event) => setSecurity({ ...security, terminalAutoLockAfterSeconds: Number(event.target.value) })}>{terminalIdleDurations.map((seconds) => <option value={seconds} key={seconds}>{durationLabel(seconds)}</option>)}</select><SettingsSwitch label="启用无操作后锁定终端" checked={security.terminalAutoLockAfterSeconds !== null} onChange={(checked) => setSecurity({ ...security, terminalAutoLockAfterSeconds: checked ? 900 : null })}/></div></div>
            </div> : <p className="dialog-note">正在读取设置…</p>}
          </> : <div className="settings-advanced-view">
            <div className="settings-section-heading"><h3 id="advanced-settings-title">高级</h3><p>管理远程终端集成等进阶功能。</p></div>
            {terminal ? <div className="settings-rows">
              <div className="settings-row">
                <span><strong>OSC 7 终端目录跟踪</strong><small>开启后显示并验证终端目录状态；远程登录会识别 Shell，并仅向当前会话注入 OSC 7 Hook。关闭后不再解析或显示 OSC 7 状态。</small></span>
                <SettingsSwitch label="OSC 7 终端目录跟踪" checked={terminal.remoteShellIntegrationEnabled} disabled={busy} onChange={changeRemoteShellIntegration}/>
              </div>
            </div> : <p className="dialog-note">正在读取设置…</p>}
          </div>}
        </div>
        <footer className="dialog-actions settings-actions">
          <div className="settings-feedback-slot">
            {error ? <p className="inline-message settings-message" role="alert">{error}</p>
              : category === "advanced" && saved ? <p className="inline-message settings-message" role="status">高级设置已保存。</p>
                : category === "general" && general?.restartRequired ? <p className="inline-message settings-message" role="status">Qterm 配置目录已保存，重启 Qterm 后生效。</p> : null}
          </div>
          {category !== "advanced" && <Button variant="primary" className={`save-state-button${saved ? " saved" : ""}`} loading={busy} disabled={!security || !general || !appearance || !terminal} onClick={() => void save()}>{busy ? "保存中…" : saved ? "✓ 已保存" : "保存设置"}</Button>}
        </footer>
      </section>
    </div>
  </DialogFrame>
    {confirmRemoteIntegration && <DialogFrame compact className="settings-integration-confirmation" title="开启 OSC 7 终端目录跟踪" subtitle="本地与远程终端" onClose={() => setConfirmRemoteIntegration(false)}>
      <div className="settings-integration-confirmation-body">
        <div className="settings-integration-confirmation-intro"><span aria-hidden="true"><Icon name="terminal" size={17}/></span><p>Qterm 将跟踪终端上报的 OSC 7 目录；连接远程终端时，会先执行固定、限时的 Shell 探测命令，再向当前登录会话注入临时 Hook。</p></div>
        <ul>
          <li>不会修改远程 <code>.bashrc</code>、Profile 或其他文件</li>
          <li>只缓存目标标识与 Shell 类型，不保存命令输出或凭据</li>
          <li>瞬态探测失败会自动重试一次，仍失败则继续普通终端连接</li>
        </ul>
      </div>
      <footer className="dialog-actions">
        <Button onClick={() => setConfirmRemoteIntegration(false)}>取消</Button>
        <Button variant="primary" data-dialog-autofocus onClick={() => { setConfirmRemoteIntegration(false); void persistRemoteShellIntegration(true); }}>确认开启</Button>
      </footer>
    </DialogFrame>}
  </>;
}

function SettingsNavItem({ category, current, icon, title, subtitle, onSelect }: {
  category: SettingsCategory;
  current: SettingsCategory;
  icon: "settings" | "eye" | "lock" | "terminal";
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

function ThemeOption({ theme, current, title, description, onSelect }: {
  theme: AppearanceSettings["theme"];
  current: AppearanceSettings["theme"];
  title: string;
  description: string;
  onSelect: (theme: AppearanceSettings["theme"]) => void;
}) {
  const selected = theme === current;
  return <label className="settings-theme-option" data-selected={selected || undefined}>
    <input type="radio" name="app-theme" value={theme} checked={selected} onChange={() => onSelect(theme)}/>
    <span className={`settings-theme-preview ${theme}`} aria-hidden="true"><span/><span/><span/></span>
    <span className="settings-theme-copy"><strong>{title}</strong><small>{description}</small></span>
    {selected && <span className="settings-theme-check" aria-hidden="true">✓</span>}
  </label>;
}

function SettingsSwitch({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="settings-switch">
    <input className="settings-switch-input" type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)}/>
    <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb"/></span>
  </label>;
}

function durationLabel(seconds: number) {
  if (seconds < 3600) return `${seconds / 60} 分钟`;
  return `${seconds / 3600} 小时`;
}

function errorMessage(error: unknown) { return typeof error === "object" && error && "message" in error ? String(error.message) : "设置保存失败"; }
