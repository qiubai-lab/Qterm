import { useState, type FormEvent } from "react";

import { changeMasterPassword } from "../../lib/tauri/credentials";
import { RequiredFieldLabel } from "../RequiredFieldLabel";
import { DialogFrame } from "./DialogFrame";

export function ChangeMasterPasswordDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void | Promise<void> }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (newPassword.length < 12) { setMessage("新主密码至少需要 12 个字符"); return; }
    if (newPassword !== confirmation) { setMessage("两次输入的新主密码不一致"); return; }
    const oldSecret = oldPassword;
    const newSecret = newPassword;
    setOldPassword(""); setNewPassword(""); setConfirmation(""); setBusy(true); setMessage("");
    try {
      await changeMasterPassword(oldSecret, newSecret);
      await onSuccess();
    } catch (error) { setMessage(errorMessage(error)); setBusy(false); }
  }

  return <DialogFrame title="修改主密码" subtitle="重新保护同一份凭证数据" compact onClose={busy ? () => undefined : onClose}>
    <form className="master-password-form" onSubmit={(event) => void submit(event)}>
      <label><RequiredFieldLabel>旧主密码</RequiredFieldLabel><input data-dialog-autofocus required type="password" autoComplete="current-password" value={oldPassword} disabled={busy} onChange={(event) => setOldPassword(event.target.value)}/></label>
      <label><RequiredFieldLabel>新主密码</RequiredFieldLabel><input required type="password" autoComplete="new-password" value={newPassword} disabled={busy} onChange={(event) => setNewPassword(event.target.value)}/></label>
      <label><RequiredFieldLabel>确认新主密码</RequiredFieldLabel><input required type="password" autoComplete="new-password" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)}/></label>
      <p className="callout">修改时会迁移主密钥保护，不会重新生成凭证，也不会改变连接引用。</p>
      {message && <p className="inline-message" role="alert">{message}</p>}
      <footer className="dialog-actions end"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={busy || !oldPassword || !newPassword || !confirmation}>{busy ? "迁移中…" : "确认修改"}</button></footer>
    </form>
  </DialogFrame>;
}

function errorMessage(error: unknown) { return typeof error === "object" && error && "message" in error ? String(error.message) : "主密码修改失败"; }
