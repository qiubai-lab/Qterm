import { useState, type FormEvent } from "react";

import { Icon, type IconName } from "../components/Icon";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import type { NetworkRule, NetworkRuleInput } from "../lib/tauri/network";
import { networkRuleTypeLabel, type NetworkRuleType } from "./networkRuleTypes";

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
  const exposureNote = exposed
    ? type === "remote" ? "该监听地址可能向服务器网络中的其他设备暴露服务；请确认网络与防火墙策略。" : "该监听地址可能向本机所在网络的其他设备暴露服务；请确认网络与防火墙策略。"
    : type === "remote" ? "当前监听地址仅允许服务器本机访问。" : "当前监听地址仅允许本机访问。";
  return <DialogFrame title={rule ? "编辑网络规则" : "创建网络规则"} subtitle="配置只保存非敏感端点，启动状态不会持久化" onClose={onClose} dismissible={!busy} className="network-rule-dialog">
    <form className="network-rule-form" onSubmit={submit}>
      <NetworkRuleFlow type={type} bindHost={bindHost} bindPort={bindPort} targetHost={targetHost} targetPort={targetPort} locked={Boolean(rule)}/>
      <label>名称<input autoFocus value={name} disabled={busy} maxLength={80} onChange={(event) => setName(event.target.value)}/></label>
      <div className="form-grid">
        <label><FieldLabel icon={listenerIcon(type)}>监听地址</FieldLabel><input value={bindHost} disabled={busy} onChange={(event) => setBindHost(event.target.value)}/></label>
        <label>监听端口<input type="number" min={1} max={65535} value={bindPort} disabled={busy} onChange={(event) => setBindPort(event.target.value)}/></label>
        {type !== "socks5" && <><label><FieldLabel icon={targetIcon(type)}>目标地址</FieldLabel><input value={targetHost} disabled={busy} onChange={(event) => setTargetHost(event.target.value)}/></label><label>目标端口<input type="number" min={1} max={65535} value={targetPort} disabled={busy} onChange={(event) => setTargetPort(event.target.value)}/></label></>}
      </div>
      <p className={`network-exposure-note${exposed ? " warning" : ""}`}>{exposureNote}</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={validation || message}/><div><button type="button" className="secondary-button" disabled={busy} onClick={onBack ?? onClose}>{onBack ? "返回选择" : "取消"}</button><button className="primary-button" disabled={busy}>{busy ? "正在保存…" : "保存规则"}</button></div></footer>
    </form>
  </DialogFrame>;
}

function NetworkRuleFlow({ type, bindHost, bindPort, targetHost, targetPort, locked }: { type: NetworkRuleType; bindHost: string; bindPort: string; targetHost: string; targetPort: string; locked: boolean }) {
  const listener = endpointText(bindHost, bindPort);
  const target = type === "socks5" ? "服务器可访问的网络" : endpointText(targetHost, targetPort);
  const listenerDevice = type === "remote" ? "服务器" : "本机";
  const targetDevice = type === "remote" ? "本机" : "服务器侧";
  const sourceLabel = type === "socks5" ? "本机应用" : "浏览器 / 应用";
  const flowLabel = type === "socks5"
    ? `${sourceLabel}连接本机 SOCKS5 ${listener}，再通过服务器访问目标网络`
    : `${sourceLabel}连接${listenerDevice}监听地址 ${listener}，流量转发到${targetDevice}目标地址 ${target}`;

  return <section className="network-rule-flow" aria-labelledby="network-rule-flow-title">
    <header><strong id="network-rule-flow-title">{networkRuleTypeLabel(type)}</strong><small>{locked ? "规则类型不可修改" : "参数流向预览"}</small></header>
    <div className="network-rule-flow-route" role="img" aria-label={flowLabel}>
      <FlowNode icon="browser" label={sourceLabel} value={type === "socks5" ? "连接代理" : "发起访问"}/>
      <FlowConnector step={1}/>
      <FlowNode icon={listenerIcon(type)} label={type === "socks5" ? "本机 SOCKS5" : `${listenerDevice}监听地址`} value={listener}/>
      <FlowConnector step={2}/>
      <FlowNode icon={type === "socks5" ? "server" : targetIcon(type)} label={type === "socks5" ? "服务器网络" : `${targetDevice}目标地址`} value={target}/>
    </div>
  </section>;
}

function FlowNode({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return <span className="network-rule-flow-node" aria-hidden="true"><span className="network-rule-flow-icon"><Icon name={icon} size={16}/></span><span><small>{label}</small><code title={value}>{value}</code></span></span>;
}

function FlowConnector({ step }: { step: 1 | 2 }) {
  return <span className="network-rule-flow-connector" data-step={step} aria-hidden="true"/>;
}

function FieldLabel({ icon, children }: { icon: IconName; children: string }) {
  return <span className="network-rule-field-label"><Icon name={icon} size={12}/>{children}</span>;
}

function listenerIcon(type: NetworkRuleType): IconName {
  return type === "remote" ? "server" : "computer";
}

function targetIcon(type: NetworkRuleType): IconName {
  return type === "remote" ? "computer" : "server";
}

function endpointText(host: string, port: string): string {
  const normalizedHost = host.trim() || "未填写地址";
  const normalizedPort = port.trim() || "未填写端口";
  return `${normalizedHost}:${normalizedPort}`;
}

function isLoopback(host: string): boolean {
  const value = host.trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value.startsWith("127.");
}
