import { useState } from "react";
import { createPortal } from "react-dom";
import { forgetHostKey } from "@qterm/services/sessions";
import type { SessionEvent } from "../lib/tauri/sessions";
import { Button } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { workspaceErrorMessage } from "./workspaceRuntime";
import "./blockNotice.css";

type ChangedKey = Extract<SessionEvent, { type: "hostKeyChanged" }>;
export function BlockNotice({ message, hostKeyChange, onReconnect }: { message: string; hostKeyChange?: ChangedKey | null; onReconnect?: () => void }) {
  return <div className="block-notice" role="alert" aria-live="assertive" aria-atomic="true">
    <span>{message}</span>
    {hostKeyChange && onReconnect && <HostKeyRecovery key={`${hostKeyChange.node.host}:${hostKeyChange.node.port}:${hostKeyChange.trustedFingerprint}:${hostKeyChange.presentedFingerprint}`} change={hostKeyChange} onReconnect={onReconnect}/>}
  </div>;
}
function HostKeyRecovery({ change, onReconnect }: { change: ChangedKey; onReconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await forgetHostKey({ host: change.node.host, port: change.node.port, trustedFingerprint: change.trustedFingerprint });
      setOpen(false);
      onReconnect();
    } catch (reason) { setError(workspaceErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <>
    <button className="host-key-recovery-action" onClick={() => { setError(""); setOpen(true); }}>删除旧密钥</button>
    {open && createPortal(<DialogFrame title="清理旧主机密钥？" subtitle={`${change.node.name} · ${change.node.host}:${change.node.port}`} compact dismissible={!busy} onClose={() => setOpen(false)}>
      <p className="confirm-copy">主机密钥变化可能来自服务器重装，也可能意味着连接被冒充。请核对新指纹后再清理。仅删除此地址和端口的旧信任记录；重新连接时需要确认新密钥。</p>
      <dl className="host-key-recovery-fingerprints"><dt>旧指纹</dt><dd>{change.trustedFingerprint}</dd><dt>新指纹</dt><dd>{change.presentedFingerprint}</dd></dl>
      <p className="host-key-recovery-error" role="status">{error}</p>
      <footer className="dialog-actions end"><Button disabled={busy} onClick={() => setOpen(false)}>取消</Button><Button variant="dangerSolid" loading={busy} onClick={() => void confirm()}>清理并重新连接</Button></footer>
    </DialogFrame>, document.body)}
  </>;
}
