import { useState, type FormEvent } from "react";

import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import type { NetworkRule, NetworkRuleInput } from "../lib/tauri/network";
import { networkRuleTypeDirection, networkRuleTypeLabel, type NetworkRuleType } from "./networkRuleTypes";

export function NetworkRuleDialog({ profileId, rule, initialType, busy, message, onBack, onClose, onSave }: { profileId: string; rule: NetworkRule | null; initialType: NetworkRuleType; busy: boolean; message: string; onBack?: () => void; onClose: () => void; onSave: (input: NetworkRuleInput) => void }) {
  const type = rule?.type ?? initialType;
  const [name, setName] = useState(rule?.name ?? "");
  const [bindHost, setBindHost] = useState(rule?.bindHost ?? "127.0.0.1");
  const [bindPort, setBindPort] = useState(String(rule?.bindPort ?? (type === "socks5" ? 1080 : 8080)));
  const [targetHost, setTargetHost] = useState(rule && rule.type !== "socks5" ? rule.targetHost : "localhost");
  const [targetPort, setTargetPort] = useState(String(rule && rule.type !== "socks5" ? rule.targetPort : 80));
  const [validation, setValidation] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsedBindPort = Number(bindPort);
    const parsedTargetPort = Number(targetPort);
    if (!name.trim() || !bindHost.trim() || !Number.isInteger(parsedBindPort) || parsedBindPort < 1 || parsedBindPort > 65535) {
      setValidation("请填写名称、监听地址和 1–65535 端口");
      return;
    }
    if (type !== "socks5" && (!targetHost.trim() || !Number.isInteger(parsedTargetPort) || parsedTargetPort < 1 || parsedTargetPort > 65535)) {
      setValidation("请填写目标地址和 1–65535 端口");
      return;
    }
    setValidation("");
    onSave(type === "socks5"
      ? { type, profileId, name: name.trim(), bindHost: bindHost.trim(), bindPort: parsedBindPort }
      : { type, profileId, name: name.trim(), bindHost: bindHost.trim(), bindPort: parsedBindPort, targetHost: targetHost.trim(), targetPort: parsedTargetPort });
  }

  const exposed = !isLoopback(bindHost);
  return <DialogFrame title={rule ? "编辑网络规则" : "创建网络规则"} subtitle="配置只保存非敏感端点，启动状态不会持久化" onClose={onClose} dismissible={!busy} className="network-rule-dialog">
    <form className="network-rule-form" onSubmit={submit}>
      <div className="network-selected-type" aria-label={`规则类型：${networkRuleTypeLabel(type)}`}><span><strong>{networkRuleTypeLabel(type)}</strong><code>{networkRuleTypeDirection(type)}</code></span><small>{rule ? "规则类型不可修改" : "已选择模式"}</small></div>
      <label>名称<input autoFocus value={name} disabled={busy} maxLength={80} onChange={(event) => setName(event.target.value)}/></label>
      <div className="form-grid">
        <label>监听地址<input value={bindHost} disabled={busy} onChange={(event) => setBindHost(event.target.value)}/></label>
        <label>监听端口<input type="number" min={1} max={65535} value={bindPort} disabled={busy} onChange={(event) => setBindPort(event.target.value)}/></label>
        {type !== "socks5" && <><label>目标地址<input value={targetHost} disabled={busy} onChange={(event) => setTargetHost(event.target.value)}/></label><label>目标端口<input type="number" min={1} max={65535} value={targetPort} disabled={busy} onChange={(event) => setTargetPort(event.target.value)}/></label></>}
      </div>
      <p className={`network-exposure-note${exposed ? " warning" : ""}`}>{exposed ? "该监听地址可能向其他设备暴露服务；请确认网络与防火墙策略。" : "当前监听地址仅允许本机访问。"}</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={validation || message}/><div><button type="button" className="secondary-button" disabled={busy} onClick={onBack ?? onClose}>{onBack ? "返回选择" : "取消"}</button><button className="primary-button" disabled={busy}>{busy ? "正在保存…" : "保存规则"}</button></div></footer>
    </form>
  </DialogFrame>;
}

function isLoopback(host: string): boolean {
  const value = host.trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value.startsWith("127.");
}
