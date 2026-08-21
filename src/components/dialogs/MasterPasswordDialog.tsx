import { useState, type FormEvent } from "react";

import { initializeVault, unlockVault } from "../../lib/tauri/credentials";
import { RequiredFieldLabel } from "../RequiredFieldLabel";
import { DialogActionStatus, DialogFrame } from "./DialogFrame";

export type MasterPasswordMode = "initialize" | "unlock";

export function MasterPasswordDialog({ mode, onSuccess, onClose }: { mode: MasterPasswordMode; onSuccess: () => void | Promise<void>; onClose: () => void }) {
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const initializing = mode === "initialize";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (masterPassword.length < 12) { setMessage("主密码至少需要 12 个字符"); return; }
    if (initializing && masterPassword !== confirmation) { setMessage("两次输入的主密码不一致"); return; }
    if (initializing) {
      setMessage("");
      setSavePromptOpen(true);
      return;
    }
    void unlock();
  }

  async function unlock() {
    const secret = masterPassword;
    setMasterPassword("");
    setSubmitting(true);
    setMessage("");
    try {
      await unlockVault(secret);
      await onSuccess();
    } catch (error) {
      setMessage(errorMessage(error));
      setSubmitting(false);
    }
  }

  async function saveRecoveryAndInitialize() {
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const result = await initializeVault(masterPassword);
      if (!result.completed) {
        setSubmitting(false);
        return;
      }
      setMasterPassword("");
      setConfirmation("");
      setSavePromptOpen(false);
      await onSuccess();
    } catch (error) {
      setMessage(errorMessage(error));
      setSubmitting(false);
    }
  }

  const title = initializing ? "初始化密码保险库" : "解锁密码保险库";
  return <>
  <DialogFrame title={title} subtitle={initializing ? "主密码与恢复密钥共同保护本地凭证" : "本次操作需要重新验证主密码"} onClose={submitting ? () => undefined : onClose} compact>
    <form className="master-password-form" onSubmit={submit}>
      <label><RequiredFieldLabel>主密码</RequiredFieldLabel><input data-dialog-autofocus required type="password" autoComplete={initializing ? "new-password" : "current-password"} value={masterPassword} disabled={submitting} onChange={(event) => setMasterPassword(event.target.value)} /></label>
      {initializing && <label><RequiredFieldLabel>确认主密码</RequiredFieldLabel><input required type="password" autoComplete="new-password" value={confirmation} disabled={submitting} onChange={(event) => setConfirmation(event.target.value)} /></label>}
      <p className="callout">{initializing ? "初始化时将保存一份恢复密钥文件。请与 secrets.vault 分开、离线保管；任何同时取得两者的人都可以重置主密码。" : "应用不会保存主密码；忘记后可使用初始化时保存的恢复密钥文件重置。"}</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={savePromptOpen ? "" : message}/><div><button type="button" className="secondary-button" disabled={submitting} onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={submitting}>{submitting ? "正在验证…" : initializing ? "初始化" : "验证"}</button></div></footer>
    </form>
  </DialogFrame>
  {initializing && savePromptOpen && <DialogFrame title="保存恢复密钥" subtitle="保存成功后才会创建凭证库" compact onClose={submitting ? () => undefined : () => { setSavePromptOpen(false); setMessage(""); }}>
    <div className="recovery-save-confirmation">
      <p className="callout">请选择与 secrets.vault 分开的本地或离线位置。恢复密钥用于忘记主密码时重置访问权限，请妥善保管。</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={message}/><div><button type="button" className="secondary-button" disabled={submitting} onClick={() => { setSavePromptOpen(false); setMessage(""); }}>返回</button><button type="button" data-dialog-autofocus className="primary-button" disabled={submitting} onClick={() => void saveRecoveryAndInitialize()}>{submitting ? "正在保存…" : "保存到本地并初始化"}</button></div></footer>
    </div>
  </DialogFrame>}
  </>;
}

function errorMessage(error: unknown): string {
  return typeof error === "object" && error && "message" in error ? String(error.message) : "主密码验证失败";
}
