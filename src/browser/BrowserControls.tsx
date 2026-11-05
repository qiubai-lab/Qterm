import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { useBrowserInterface, type InterfaceMode, type KeybarMode } from "./browserInterfaceContext";

export function BrowserControls() {
  const { enabled, preferences, update } = useBrowserInterface();
  const [settings, setSettings] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const supported = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  async function toggleFullscreen() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setError("浏览器未能切换全屏，请重试或检查浏览器权限。"); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!enabled) return null;
  return <>
    <button aria-label="浏览器显示设置" title="浏览器显示设置" onClick={() => setSettings(true)}><Icon name="computer" size={16}/></button>
    {supported && <button aria-label={fullscreen ? "退出浏览器全屏" : "进入浏览器全屏"} title={fullscreen ? "退出浏览器全屏" : "进入浏览器全屏"} aria-pressed={fullscreen} disabled={busy} onClick={() => void toggleFullscreen()}><Icon name={fullscreen ? "windowMinimize" : "windowMaximize"} size={16}/></button>}
    {error && <span className="browser-fullscreen-error" role="alert" onClick={() => setError("")}>{error}</span>}
    {settings && <DialogFrame compact title="浏览器显示设置" subtitle="仅保存在当前浏览器" onClose={() => setSettings(false)}>
      <div className="browser-display-settings">
        <label>操作方式<select value={preferences.mode} onChange={event => update({ mode: event.target.value as InterfaceMode })}><option value="auto">自动适配</option><option value="touch">触控</option><option value="desktop">桌面</option></select></label>
        <label>终端快捷键栏<select value={preferences.keybar} onChange={event => update({ keybar: event.target.value as KeybarMode })}><option value="auto">随操作方式自动显示</option><option value="show">始终显示</option><option value="hide">隐藏</option></select></label>
        <p>{supported ? "全屏按钮位于顶部工具栏，退出后保留当前布局。" : "当前浏览器不支持页面全屏，仍可使用全部终端功能。"}</p>
      </div>
    </DialogFrame>}
  </>;
}
