import { useState, type FormEvent } from "react";

import { unlockVault } from "../../lib/tauri/credentials";
import { Icon } from "../Icon";
import { DialogActionStatus, DialogFrame } from "./DialogFrame";

export function TerminalLockChoiceDialog({ vaultUnlocked, busy, message, onClose, onLockVault, onLockTerminalAndVault }: { vaultUnlocked: boolean; busy: boolean; message: string; onClose: () => void; onLockVault: () => void; onLockTerminalAndVault: () => void }) {
  return <DialogFrame title="锁定终端" subtitle="选择本次锁定范围" onClose={busy ? () => undefined : onClose} compact className="terminal-lock-choice-dialog">
    <div className="terminal-lock-options">
      <button type="button" aria-label="锁定凭证库" disabled={busy || !vaultUnlocked} onClick={onLockVault}>
        <span className="terminal-lock-option-icon"><Icon name="key" size={17}/></span>
        <span><strong>锁定凭证库</strong><small>{vaultUnlocked ? "清除运行时密钥，终端会话继续运行" : "凭证库当前已经锁定"}</small></span>
      </button>
      <button type="button" data-dialog-autofocus aria-label="锁定终端和凭证" disabled={busy} onClick={onLockTerminalAndVault}>
        <span className="terminal-lock-option-icon"><Icon name="lock" size={17}/></span>
        <span><strong>{busy ? "正在锁定…" : "锁定终端和凭证"}</strong><small>暂停终端区域操作，需主密码同时恢复</small></span>
      </button>
    </div>
    {message && <p className="inline-message" role="alert">{message}</p>}
  </DialogFrame>;
}

export function TerminalLockScreen({ onUnlocked }: { onUnlocked: () => void | Promise<void> }) {
  const [masterPassword, setMasterPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (masterPassword.length < 12) { setMessage("主密码至少需要 12 个字符"); return; }
    const secret = masterPassword;
    setMasterPassword("");
    setSubmitting(true);
    setMessage("");
    const fail = (error: unknown) => {
      setMessage(errorMessage(error));
      setSubmitting(false);
    };
    void unlockVault(secret).then(onUnlocked, fail).catch(fail);
  }

  return <DialogFrame title="终端已锁定" subtitle="输入主密码以同时解锁终端和凭证库" onClose={() => undefined} compact dismissible={false} modal={false} className="terminal-lock-dialog" scrimClassName="terminal-lock-scrim">
    <form className="terminal-unlock-form" onSubmit={submit}>
      <div className="terminal-lock-identity"><span><Icon name="lock" size={21}/></span><div><strong>终端区域操作已暂停</strong><p>顶部工作区与窗口控制仍可使用；终端和文件会话继续在后台运行。</p></div></div>
      <label>主密码<input data-dialog-autofocus type="password" autoComplete="current-password" value={masterPassword} disabled={submitting} onChange={(event) => setMasterPassword(event.target.value)}/></label>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={message}/><button type="submit" className="primary-button" disabled={submitting}>{submitting ? "正在验证…" : "解锁终端和凭证"}</button></footer>
    </form>
  </DialogFrame>;
}

function errorMessage(error: unknown): string {
  return typeof error === "object" && error && "message" in error ? String(error.message) : "主密码验证失败";
}
