import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useState } from "react";

import { Icon } from "../components/Icon";
import { IconButton, StatusBadge } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { listProxyBrowsers, launchProxyBrowser, type ProxyBrowserAvailability, type ProxyBrowserId } from "../lib/tauri/browserProxy";
import type { NetworkRule, NetworkRuleRuntimeState } from "../lib/tauri/network";
import { deriveNetworkAccess, type NetworkAccessField } from "./networkAccess";

const BROWSERS: ProxyBrowserAvailability[] = [
  { id: "chrome", name: "Google Chrome", installed: false, supported: true },
  { id: "edge", name: "Microsoft Edge", installed: false, supported: true },
];

export function NetworkAccessDialog({ rule, profileHost, runtimeState, activeElsewhere, onClose }: {
  rule: NetworkRule;
  profileHost: string;
  runtimeState: NetworkRuleRuntimeState;
  activeElsewhere: boolean;
  onClose: () => void;
}) {
  const access = deriveNetworkAccess(rule, profileHost);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [browsers, setBrowsers] = useState(BROWSERS);
  const [detecting, setDetecting] = useState(rule.type === "socks5");
  const [launching, setLaunching] = useState<ProxyBrowserId | null>(null);
  const [proxyLocalAddresses, setProxyLocalAddresses] = useState(true);
  const listenerExpected = runtimeState === "running" || activeElsewhere;

  useEffect(() => {
    if (rule.type !== "socks5") return;
    let cancelled = false;
    listProxyBrowsers()
      .then((items) => {
        if (!cancelled) setBrowsers(BROWSERS.map((browser) => items.find((item) => item.id === browser.id) ?? { ...browser, supported: false }));
      })
      .catch(() => {
        if (!cancelled) {
          setBrowsers(BROWSERS.map((browser) => ({ ...browser, supported: false })));
          showMessage("无法检测代理浏览器", true);
        }
      })
      .finally(() => { if (!cancelled) setDetecting(false); });
    return () => { cancelled = true; };
  }, [rule.type]);

  function showMessage(value: string, error = false) {
    setMessage(value);
    setMessageError(error);
  }

  async function copy(field: NetworkAccessField) {
    try {
      await writeClipboardText(field.value);
      showMessage(`${field.label}已复制`);
    } catch {
      showMessage("复制失败，请手动选择地址复制", true);
    }
  }

  async function launch(browser: ProxyBrowserAvailability) {
    if (!listenerExpected || !browser.installed || !browser.supported || launching) return;
    setLaunching(browser.id);
    showMessage(`正在启动 ${browser.name}…`);
    try {
      await launchProxyBrowser(rule.id, browser.id, proxyLocalAddresses);
      showMessage(`已启动 ${browser.name} 独立代理窗口`);
    } catch (error) {
      showMessage(errorMessage(error), true);
    } finally {
      setLaunching(null);
    }
  }

  return <DialogFrame
    className="network-access-dialog"
    title={`访问 ${rule.name}`}
    subtitle={rule.type === "socks5" ? "复制代理地址或启动独立代理浏览器" : "复制转发端点，或手动选择地址"}
    headerActions={rule.type === "socks5" ? <StatusBadge tone="warning" presentation="tag" size="compact">实验性</StatusBadge> : undefined}
    onClose={onClose}
  >
    <div className="network-access-content network-access-content-compact">
      <section className="network-access-addresses" aria-label="访问地址">
        {access.description && <p className="network-access-description"><Icon name={rule.type === "remote" ? "server" : "computer"} size={14}/><span>{access.description}</span></p>}
        {access.fields.map((field) => <div className="network-access-field" key={field.label}>
          <label htmlFor={`network-access-${rule.id}-${field.label}`}>{field.label}</label>
          <div>
            <input id={`network-access-${rule.id}-${field.label}`} readOnly value={field.value} onFocus={(event) => event.currentTarget.select()}/>
            <IconButton label={`复制${field.label}`} variant="secondary" className="network-access-copy-button" title={`复制${field.label}`} onClick={() => void copy(field)}><Icon name="copy" size={13}/></IconButton>
          </div>
        </div>)}
        {access.warning && <p className="network-access-warning"><Icon name="network" size={13}/><span>{access.warning}</span></p>}
      </section>

      {rule.type === "socks5" && <section className="network-access-browsers" role="group" aria-label="代理浏览器">
        <header><div><strong>通过代理打开浏览器</strong><p>使用隔离 Profile；主要代理网页请求，不保证扩展或 WebRTC 流量。</p></div></header>
        <div className="network-access-proxy-option">
          <span><strong>代理本地与内网地址</strong><small>{proxyLocalAddresses
            ? "localhost 将指向远程服务器环境；回环与链路本地地址也通过 SOCKS5。"
            : "localhost 和链路本地地址由浏览器直接访问；常规内网地址仍通过 SOCKS5。"}</small></span>
          <button type="button" className="network-access-option-switch" role="switch" aria-label="代理本地与内网地址" aria-checked={proxyLocalAddresses} disabled={launching !== null} onClick={() => setProxyLocalAddresses((enabled) => !enabled)}>
            <span aria-hidden="true"/>
          </button>
        </div>
        <div className="network-access-browser-grid">
          {browsers.map((browser) => {
            const busy = launching === browser.id;
            const unavailable = !browser.supported || !browser.installed;
            const disabled = detecting || unavailable || !listenerExpected || launching !== null;
            const visualState = detecting ? "detecting" : unavailable ? "unavailable" : !listenerExpected ? "waiting" : busy ? "launching" : "ready";
            const ariaLabel = detecting
              ? `正在检测 ${browser.name}`
              : !browser.supported ? `${browser.name} 当前平台不支持`
                : !browser.installed ? `${browser.name} 未安装`
                  : !listenerExpected ? `请先启动 ${rule.name} 后使用 ${browser.name}`
                    : busy ? `正在启动 ${browser.name}` : `使用 ${browser.name} 打开`;
            const status = detecting ? "检测中…" : !browser.supported ? "当前平台不支持" : !browser.installed ? "未检测到" : busy ? "启动中…" : listenerExpected ? "使用 SOCKS5 启动" : "等待代理启动";
            return <button type="button" key={browser.id} data-state={visualState} aria-label={ariaLabel} disabled={disabled} onClick={() => void launch(browser)}>
              <span className="network-access-browser-icon"><Icon name="browser" size={17}/></span>
              <span><strong>{browser.name}</strong><small>{status}</small></span>
            </button>;
          })}
        </div>
      </section>}

      <div className={`network-access-footer${rule.type === "socks5" ? " with-note" : ""}${message ? " has-message" : ""}${messageError ? " error" : ""}`}>
        {rule.type === "socks5" && <p className="network-access-footer-note" aria-hidden={message ? true : undefined}>
          <Icon name="network" size={12}/><span>{listenerExpected
            ? "仅新启动的独立窗口使用此代理；停止 SOCKS5 后浏览器可能无法继续访问网络。"
            : "请先启动 SOCKS5 实例，再打开代理浏览器。"}</span>
        </p>}
        <p className="network-access-footer-status" role={messageError ? "alert" : undefined} aria-live="polite" title={message || undefined}>{message}</p>
      </div>
    </div>
  </DialogFrame>;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return error instanceof Error ? error.message : "无法启动代理浏览器";
}
