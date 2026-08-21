import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { Icon } from "../components/Icon";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { createNetworkRule, deleteNetworkRule, listNetworkRules, updateNetworkRule, type NetworkRule, type NetworkRuleInput, type NetworkRuleRuntimeState } from "../lib/tauri/network";
import { NetworkAccessDialog } from "./NetworkAccessDialog";
import { NetworkRuleDialog } from "./NetworkRuleDialog";
import { NetworkRuleTypeDialog } from "./NetworkRuleTypeDialog";
import type { NetworkRuleType } from "./networkRuleTypes";

const NETWORK_RULES_CHANGED_EVENT = "qterm:network-rules-changed";

type ContextMenuState = {
  rule: NetworkRule;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  placement: "above" | "below";
};

export function NetworkPane({ profileId, profileHost = "", runtimeStates = {}, lockedRuleIds = new Set(), onStart, onStop }: { profileId: string | null; profileHost?: string; runtimeStates?: Record<string, NetworkRuleRuntimeState>; lockedRuleIds?: ReadonlySet<string>; onStart?: (rule: NetworkRule) => void; onStop?: (rule: NetworkRule) => void }) {
  const [rules, setRules] = useState<NetworkRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<NetworkRule | null>(null);
  const [choosingType, setChoosingType] = useState(false);
  const [newRuleType, setNewRuleType] = useState<NetworkRuleType | null>(null);
  const [deleteRule, setDeleteRule] = useState<NetworkRule | null>(null);
  const [accessRule, setAccessRule] = useState<NetworkRule | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [busy, setBusy] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId) { setRules([]); return; }
    if (!("__TAURI_INTERNALS__" in window)) { setRules([]); return; }
    setLoading(true); setMessage("");
    try { setRules(await listNetworkRules(profileId)); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setLoading(false); }
  }, [profileId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const handleChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === profileId) void refresh();
    };
    window.addEventListener(NETWORK_RULES_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(NETWORK_RULES_CHANGED_EVENT, handleChange);
  }, [profileId, refresh]);
  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".network-context-menu")) setContextMenu(null);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => contextMenuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const fitted = fitContextMenu(contextMenu.anchorX, contextMenu.anchorY, contextMenuRef.current);
    if (fitted.x !== contextMenu.x || fitted.y !== contextMenu.y || fitted.placement !== contextMenu.placement) {
      setContextMenu((current) => current ? { ...current, ...fitted } : null);
    }
  }, [contextMenu]);

  async function save(input: NetworkRuleInput) {
    setBusy(true); setMessage("");
    try {
      if (editor) await updateNetworkRule(editor.id, input);
      else await createNetworkRule(input);
      setEditor(null); setNewRuleType(null);
      if (profileId) notifyRulesChanged(profileId);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!deleteRule) return;
    setBusy(true); setMessage("");
    try { await deleteNetworkRule(deleteRule.id); setDeleteRule(null); if (profileId) notifyRulesChanged(profileId); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, rule: NetworkRule) {
    event.preventDefault();
    setContextMenu({ rule, anchorX: event.clientX, anchorY: event.clientY, x: event.clientX, y: event.clientY, placement: "below" });
  }

  function openKeyboardContextMenu(event: KeyboardEvent<HTMLElement>, rule: NetworkRule) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({ rule, anchorX: rect.left + 18, anchorY: rect.top + rect.height / 2, x: rect.left + 18, y: rect.top + rect.height / 2, placement: "below" });
  }

  function returnToTypeSelection() {
    if (busy) return;
    setNewRuleType(null);
    setChoosingType(true);
  }

  function closeRuleDialog() {
    if (busy) return;
    if (!editor) {
      returnToTypeSelection();
      return;
    }
    setEditor(null);
    setNewRuleType(null);
  }

  if (!profileId) return <div className="network-empty"><Icon name="network" size={28}/><strong>选择远程连接</strong><p>网络规则按连接配置保存。选择连接后即可创建端口转发或 SOCKS5 代理。</p></div>;

  return <div className="network-pane">
    <div className="network-toolbar"><div className="network-toolbar-summary"><strong>网络实例</strong><span>{rules.length} 条配置 · 默认停止</span></div><button className="network-create-button" aria-label="创建网络实例" title="创建网络实例" onClick={() => setChoosingType(true)}><Icon name="plus" size={12}/></button></div>
    {message && <div className="network-inline-error" role="alert">{message}</div>}
    <div className={`network-rule-list${!loading && rules.length === 0 ? " empty" : ""}`} role="list" aria-busy={loading}>
      {loading ? <div className="network-empty"><span>正在读取网络规则…</span></div> : rules.length === 0 ? <div className="network-empty"><Icon name="network" size={25}/><strong>暂无网络实例</strong><p>创建本地、远程端口转发或 SOCKS5 动态代理。</p></div> : rules.map((rule) => {
        const state = runtimeStates[rule.id] ?? "stopped";
        const switchOn = state === "running" || state === "starting";
        const transitioning = state === "starting" || state === "stopping";
        const switchLabel = state === "starting" ? `正在启动 ${rule.name}` : state === "stopping" ? `正在停止 ${rule.name}` : switchOn ? `停止 ${rule.name}` : `启动 ${rule.name}`;
        const socksAccess = rule.type === "socks5";
        const accessLabel = socksAccess ? `打开 ${rule.name} 代理工具` : `查看并复制 ${rule.name} 访问地址`;
        return <article className="network-rule-item with-access-label" role="listitem" tabIndex={0} aria-label={`${rule.name}，${stateLabel(state)}`} key={rule.id} data-state={state} onContextMenu={(event) => openContextMenu(event, rule)} onKeyDown={(event) => openKeyboardContextMenu(event, rule)}>
          <span className={`network-rule-dot ${state}`}/><div className="network-rule-copy"><strong>{rule.name}</strong><NetworkRuleRoute rule={rule}/><small>{typeLabel(rule.type)}{rule.exposed ? " · 对外监听" : " · 仅本机"}</small></div>
          <button type="button" className="network-rule-access-button labeled" aria-label={accessLabel} title={socksAccess ? "代理地址与浏览器" : "查看与复制访问地址"} onClick={() => setAccessRule(rule)}><Icon name={socksAccess ? "browser" : "copy"} size={socksAccess ? 12 : 13}/><span>{socksAccess ? "代理" : "复制"}</span></button>
          <label className="network-rule-switch" title={switchLabel}>
            <input className="network-rule-switch-input" type="checkbox" role="switch" aria-label={switchLabel} checked={switchOn} disabled={transitioning || (switchOn ? !onStop : !onStart)} onChange={(event) => event.target.checked ? onStart?.(rule) : onStop?.(rule)}/>
            <span className="network-rule-switch-track"><span className="network-rule-switch-label on">ON</span><span className="network-rule-switch-label off">OFF</span><span className="network-rule-switch-thumb"/></span>
          </label>
        </article>;
      })}
    </div>
    {contextMenu && (() => {
      const state = runtimeStates[contextMenu.rule.id] ?? "stopped";
      const mutationLocked = state === "running" || state === "starting" || state === "stopping" || lockedRuleIds.has(contextMenu.rule.id);
      const lockTitle = lockedRuleIds.has(contextMenu.rule.id) && state === "stopped" ? "该规则正在其他网络窗口运行" : "请先停止该规则";
      return <div ref={contextMenuRef} className="network-context-menu" role="menu" aria-label={`${contextMenu.rule.name} 网络规则菜单`} data-placement={contextMenu.placement} style={{ left: contextMenu.x, top: contextMenu.y }}>
        <button role="menuitem" disabled={mutationLocked} title={mutationLocked ? lockTitle : undefined} onClick={() => { setContextMenu(null); setEditor(contextMenu.rule); }}><Icon name="edit" size={13}/><span>编辑规则</span></button>
        <button className="danger" role="menuitem" disabled={mutationLocked} title={mutationLocked ? lockTitle : undefined} onClick={() => { setContextMenu(null); setDeleteRule(contextMenu.rule); }}><Icon name="trash" size={13}/><span>删除规则</span></button>
      </div>;
    })()}
    {choosingType && <NetworkRuleTypeDialog
      onClose={() => setChoosingType(false)}
      onSelect={(type) => { setChoosingType(false); setNewRuleType(type); }}
    />}
    {(editor || newRuleType) && <NetworkRuleDialog
      profileId={profileId}
      rule={editor}
      initialType={editor?.type ?? newRuleType ?? "local"}
      busy={busy}
      message={message}
      onBack={!editor ? returnToTypeSelection : undefined}
      onClose={closeRuleDialog}
      onSave={(input) => void save(input)}
    />}
    {accessRule && <NetworkAccessDialog
      rule={accessRule}
      profileHost={profileHost || accessRule.bindHost}
      runtimeState={runtimeStates[accessRule.id] ?? "stopped"}
      activeElsewhere={lockedRuleIds.has(accessRule.id)}
      onClose={() => setAccessRule(null)}
    />}
    {deleteRule && <DialogFrame compact title="删除网络规则？" subtitle="将移除持久化配置" dismissible={!busy} onClose={() => { if (!busy) setDeleteRule(null); }}><p className="confirm-copy">将删除“{deleteRule.name}”。此操作无法撤销，但不会删除连接配置。</p><footer className="dialog-actions end"><button className="secondary-button" disabled={busy} onClick={() => setDeleteRule(null)}>取消</button><button className="danger-button filled" disabled={busy} onClick={() => void confirmDelete()}>{busy ? "正在删除…" : "删除规则"}</button></footer></DialogFrame>}
  </div>;
}

function notifyRulesChanged(profileId: string) {
  window.dispatchEvent(new CustomEvent(NETWORK_RULES_CHANGED_EVENT, { detail: profileId }));
}

type RouteEndpoint = {
  label: string;
  address: string;
  icon: "computer" | "server";
};

function NetworkRuleRoute({ rule }: { rule: NetworkRule }) {
  const [source, target] = routeEndpoints(rule);
  const label = `${source.label} ${source.address} → ${target.label} ${target.address}`;
  return <div className="network-rule-route" aria-label={label} title={label}>
    <NetworkRuleRouteContent source={source} target={target}/>
    <span className="network-rule-route-highlight" aria-hidden="true"><NetworkRuleRouteContent source={source} target={target}/></span>
  </div>;
}

function NetworkRuleRouteContent({ source, target }: { source: RouteEndpoint; target: RouteEndpoint }) {
  return <span className="network-rule-route-content"><RouteEndpointView endpoint={source}/><span className="network-rule-route-arrow" aria-hidden="true">→</span><RouteEndpointView endpoint={target}/></span>;
}

function RouteEndpointView({ endpoint }: { endpoint: RouteEndpoint }) {
  return <span className="network-rule-endpoint"><span className="network-rule-endpoint-icon"><Icon name={endpoint.icon} size={11}/></span><span className="network-rule-endpoint-label">{endpoint.label}</span><code>{endpoint.address}</code></span>;
}

function routeEndpoints(rule: NetworkRule): [RouteEndpoint, RouteEndpoint] {
  const bindAddress = `${rule.bindHost}:${rule.bindPort}`;
  if (rule.type === "remote") {
    return [
      { label: "远程", address: bindAddress, icon: "server" },
      { label: "本地", address: `${rule.targetHost}:${rule.targetPort}`, icon: "computer" },
    ];
  }
  if (rule.type === "socks5") {
    return [
      { label: "本地", address: bindAddress, icon: "computer" },
      { label: "远程网络", address: "动态目标", icon: "server" },
    ];
  }
  return [
    { label: "本地", address: bindAddress, icon: "computer" },
    { label: "远程", address: `${rule.targetHost}:${rule.targetPort}`, icon: "server" },
  ];
}

function typeLabel(type: NetworkRule["type"]): string {
  return type === "local" ? "本地转发" : type === "remote" ? "远程转发" : "SOCKS5";
}

function stateLabel(state: NetworkRuleRuntimeState): string {
  return { stopped: "已停止", starting: "启动中", running: "运行中", stopping: "停止中", failed: "失败" }[state];
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return error instanceof Error ? error.message : String(error);
}

function fitContextMenu(anchorX: number, anchorY: number, menu: HTMLDivElement): Pick<ContextMenuState, "x" | "y" | "placement"> {
  const gap = 6;
  const inset = 6;
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const placement = anchorY + menuHeight + gap > window.innerHeight ? "above" : "below";
  return {
    x: Math.max(inset, Math.min(anchorX, window.innerWidth - menuWidth - inset)),
    y: placement === "above" ? Math.max(inset, anchorY - menuHeight - gap) : Math.min(anchorY + gap, window.innerHeight - menuHeight - inset),
    placement,
  };
}
