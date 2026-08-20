import { useState, type FormEvent } from "react";

import { cancelMasterPasswordReset, prepareMasterPasswordReset, resetMasterPassword } from "../../lib/tauri/credentials";
import { DialogActionStatus, DialogFrame } from "./DialogFrame";

type RecoveryPhase = "selectKey" | "newPassword" | "saveKey";

export function RecoveryMasterPasswordDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void | Promise<void> }) {
  const [phase, setPhase] = useState<RecoveryPhase>("selectKey");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function clearPendingRecovery() {
    void cancelMasterPasswordReset().catch(() => undefined);
  }

  function closeFlow() {
    clearPendingRecovery();
    setMessage("");
    onClose();
  }

  function returnToKeySelection() {
    clearPendingRecovery();
    setNewPassword("");
    setConfirmation("");
    setMessage("");
    setPhase("selectKey");
  }

  async function selectExistingRecovery() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await prepareMasterPasswordReset();
      if (result.completed) setPhase("newPassword");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (newPassword.length < 12) { setMessage("新主密码至少需要 12 个字符"); return; }
    if (newPassword !== confirmation) { setMessage("两次输入的新主密码不一致"); return; }
    setMessage("");
    setPhase("saveKey");
  }

  async function saveNewRecovery() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await resetMasterPassword(newPassword);
      if (!result.completed) return;
      setNewPassword("");
      setConfirmation("");
      await onSuccess();
    } catch (error) {
      clearPendingRecovery();
      setNewPassword("");
      setConfirmation("");
      setPhase("selectKey");
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "selectKey") {
    return <DialogFrame title="验证恢复密钥" subtitle="先加载属于当前凭证库的恢复密钥" compact onClose={busy ? () => undefined : closeFlow}>
      <div className="recovery-save-confirmation">
        <p className="callout">选择恢复密钥文件后将立即校验文件格式、凭证库归属与有效性。校验通过后才能设置新的主密码。</p>
        <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={message}/><div><button type="button" className="secondary-button" disabled={busy} onClick={closeFlow}>取消</button><button type="button" data-dialog-autofocus className="primary-button" disabled={busy} onClick={() => void selectExistingRecovery()}>{busy ? "正在验证…" : "选择恢复密钥文件"}</button></div></footer>
      </div>
    </DialogFrame>;
  }

  if (phase === "newPassword") {
    return <DialogFrame title="设置新主密码" subtitle="恢复密钥已验证" compact onClose={busy ? () => undefined : returnToKeySelection}>
      <form className="master-password-form" onSubmit={submitPassword}>
        <label>新主密码<input data-dialog-autofocus type="password" autoComplete="new-password" value={newPassword} disabled={busy} onChange={(event) => setNewPassword(event.target.value)}/></label>
        <label>确认新主密码<input type="password" autoComplete="new-password" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)}/></label>
        <p className="callout">新主密码至少需要 12 个字符。下一步将先提示你保存替代恢复密钥，保存成功后旧密钥才会失效。</p>
        <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={message}/><div><button type="button" className="secondary-button" disabled={busy} onClick={returnToKeySelection}>返回</button><button type="submit" className="primary-button" disabled={busy || !newPassword || !confirmation}>继续</button></div></footer>
      </form>
    </DialogFrame>;
  }

  return <DialogFrame title="保存新恢复密钥" subtitle="保存成功后才会重置主密码" compact onClose={busy ? () => undefined : () => { setMessage(""); setPhase("newPassword"); }}>
    <div className="recovery-save-confirmation">
      <p className="callout">点击保存后再选择新密钥的本地位置；新文件写入成功后，新主密码才会生效且旧恢复密钥将失效。</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={message}/><div><button type="button" className="secondary-button" disabled={busy} onClick={() => { setMessage(""); setPhase("newPassword"); }}>返回</button><button type="button" data-dialog-autofocus className="primary-button" disabled={busy} onClick={() => void saveNewRecovery()}>{busy ? "正在保存…" : "保存新密钥到本地"}</button></div></footer>
    </div>
  </DialogFrame>;
}

function errorMessage(error: unknown) { return typeof error === "object" && error && "message" in error ? String(error.message) : "主密码重置失败"; }
