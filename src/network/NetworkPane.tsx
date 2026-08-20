import { useCallback, useEffect, useState } from "react";

import { Icon } from "../components/Icon";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { createNetworkRule, deleteNetworkRule, listNetworkRules, updateNetworkRule, type NetworkRule, type NetworkRuleInput, type NetworkRuleRuntimeState } from "../lib/tauri/network";
import { NetworkRuleDialog } from "./NetworkRuleDialog";

const NETWORK_RULES_CHANGED_EVENT = "qterm:network-rules-changed";

export function NetworkPane({ profileId, runtimeStates = {}, lockedRuleIds = new Set(), onStart, onStop }: { profileId: string | null; runtimeStates?: Record<string, NetworkRuleRuntimeState>; lockedRuleIds?: ReadonlySet<string>; onStart?: (rule: NetworkRule) => void; onStop?: (rule: NetworkRule) => void }) {
  const [rules, setRules] = useState<NetworkRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<NetworkRule | "new" | null>(null);
  const [deleteRule, setDeleteRule] = useState<NetworkRule | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function save(input: NetworkRuleInput) {
    setBusy(true); setMessage("");
    try {
      if (editor && editor !== "new") await updateNetworkRule(editor.id, input);
      else await createNetworkRule(input);
      setEditor(null);
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

  if (!profileId) return <div className="network-empty"><Icon name="network" size={28}/><strong>选择远程连接</strong><p>网络规则按连接配置保存。选择连接后即可创建端口转发或 SOCKS5 代理。</p></div>;

  return <div className="network-pane">
    <div className="network-toolbar"><div><strong>网络实例</strong><small>{rules.length} 条配置 · 默认停止</small></div><button className="primary-button" onClick={() => setEditor("new")}><Icon name="plus" size={12}/>创建实例</button></div>
    {message && <div className="network-inline-error" role="alert">{message}</div>}
    <div className="network-rule-list" aria-busy={loading}>
      {loading ? <div className="network-empty"><span>正在读取网络规则…</span></div> : rules.length === 0 ? <div className="network-empty"><Icon name="network" size={25}/><strong>暂无网络实例</strong><p>创建本地、远程端口转发或 SOCKS5 动态代理。</p></div> : rules.map((rule) => {
        const state = runtimeStates[rule.id] ?? "stopped";
        const running = state === "running" || state === "starting" || state === "stopping";
        const mutationLocked = running || lockedRuleIds.has(rule.id);
        return <article className="network-rule-item" key={rule.id} data-state={state}>
          <span className={`network-rule-dot ${state}`}/><div className="network-rule-copy"><strong>{rule.name}</strong><code>{endpointSummary(rule)}</code><small>{typeLabel(rule.type)}{rule.exposed ? " · 对外监听" : " · 仅本机"}</small></div>
          <span className="network-rule-status">{stateLabel(state)}</span>
          <div className="network-rule-actions"><button aria-label={`编辑 ${rule.name}`} title={mutationLocked && !running ? "该规则正在其他网络窗口运行" : undefined} disabled={mutationLocked} onClick={() => setEditor(rule)}><Icon name="edit" size={12}/></button><button aria-label={`删除 ${rule.name}`} title={mutationLocked && !running ? "该规则正在其他网络窗口运行" : undefined} disabled={mutationLocked} onClick={() => setDeleteRule(rule)}><Icon name="trash" size={12}/></button>{running ? <button className="network-stop-button" disabled={!onStop || state === "stopping"} onClick={() => onStop?.(rule)}>{state === "stopping" ? "停止中" : "停止"}</button> : <button className="network-start-button" disabled={!onStart} onClick={() => onStart?.(rule)}>启动</button>}</div>
        </article>;
      })}
    </div>
    {editor && <NetworkRuleDialog profileId={profileId} rule={editor === "new" ? null : editor} busy={busy} message={message} onClose={() => { if (!busy) setEditor(null); }} onSave={(input) => void save(input)}/>} 
    {deleteRule && <DialogFrame compact title="删除网络规则？" subtitle="运行状态与配置都会移除" dismissible={!busy} onClose={() => { if (!busy) setDeleteRule(null); }}><p className="confirm-copy">将删除“{deleteRule.name}”。此操作无法撤销，但不会删除连接配置。</p><footer className="dialog-actions end"><button className="secondary-button" disabled={busy} onClick={() => setDeleteRule(null)}>取消</button><button className="danger-button filled" disabled={busy} onClick={() => void confirmDelete()}>{busy ? "正在删除…" : "删除规则"}</button></footer></DialogFrame>}
  </div>;
}

function notifyRulesChanged(profileId: string) {
  window.dispatchEvent(new CustomEvent(NETWORK_RULES_CHANGED_EVENT, { detail: profileId }));
}

function endpointSummary(rule: NetworkRule): string {
  const source = `${rule.bindHost}:${rule.bindPort}`;
  return rule.type === "socks5" ? `${source} → SSH 动态目标` : `${source} → ${rule.targetHost}:${rule.targetPort}`;
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
