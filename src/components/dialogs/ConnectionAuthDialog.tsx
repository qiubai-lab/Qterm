import { useEffect, useState, type FormEvent } from "react";

import { getVaultStatus, listCredentials, type CredentialSummary, type VaultStatus } from "../../lib/tauri/credentials";
import type { ConnectionProfile } from "../../lib/tauri/profiles";
import type { SessionAuth } from "../../lib/tauri/sessions";
import { Button } from "../Button";
import { DialogFrame } from "./DialogFrame";
import { RequiredFieldLabel } from "../RequiredFieldLabel";
import { MasterPasswordDialog } from "./MasterPasswordDialog";

type AuthMethod = "password" | "credential" | "sshAgent";
type MotionDirection = "forward" | "backward";

const authMethodOrder: AuthMethod[] = ["password", "credential", "sshAgent"];

export function ConnectionAuthDialog({ profile, onConnect, onClose }: { profile: ConnectionProfile; onConnect: (auth: SessionAuth) => Promise<void>; onClose: () => void }) {
  const [method, setMethod] = useState<AuthMethod>(() => initialMethod(profile));
  const [password, setPassword] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>({ initialized: false, unlocked: false, legacy: false });
  const [unlocking, setUnlocking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [motionDirection, setMotionDirection] = useState<MotionDirection | null>(null);

  useEffect(() => {
    void refreshCredentials().catch((error) => setMessage(errorMessage(error)));
  }, []);

  async function refreshCredentials() {
    const status = await getVaultStatus();
    setVaultStatus(status);
    if (status.unlocked) {
      const items = await listCredentials();
      setCredentials(items);
      setCredentialId((current) => current && items.some((item) => item.id === current) ? current : "");
    } else {
      setCredentials([]);
      setCredentialId("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit(method, password, credentialId, vaultStatus) || submitting) return;
    const auth = createAuth(method, password, credentialId);
    setPassword("");
    setSubmitting(true);
    setMessage("");
    try {
      await onConnect(auth);
      onClose();
    } catch (error) {
      setMessage(errorMessage(error));
      setSubmitting(false);
    }
  }

  function selectMethod(next: AuthMethod) {
    if (submitting) return;
    if (next === method) { setMessage(""); return; }
    setMotionDirection(authMethodOrder.indexOf(next) > authMethodOrder.indexOf(method) ? "forward" : "backward");
    setMethod(next);
    setMessage("");
  }

  return <>
    <DialogFrame title={`连接 ${profile.name}`} subtitle={`${profile.username}@${profile.host}:${profile.port}`} onClose={unlocking ? () => undefined : onClose} compact className="connection-auth-dialog">
      <form className="connection-auth-form" onSubmit={(event) => void submit(event)}>
        <div className="segmented auth-method-picker" data-active={method} aria-label="认证方式">
          <span className="auth-method-indicator" aria-hidden="true"/>
          <button type="button" className={method === "password" ? "selected" : ""} aria-pressed={method === "password"} onClick={() => selectMethod("password")}><span>密码</span></button>
          <button type="button" className={method === "credential" ? "selected" : ""} aria-pressed={method === "credential"} onClick={() => selectMethod("credential")}><span>凭证</span></button>
          <button type="button" className={method === "sshAgent" ? "selected" : ""} aria-pressed={method === "sshAgent"} onClick={() => selectMethod("sshAgent")}><span>SSH Agent</span></button>
        </div>

        <div key={method} className={`auth-method-content auth-method-panel${motionDirection ? ` auth-${motionDirection}` : " auth-idle"}`} data-method={method}>
          {method === "password" && <>
            <p className="auth-security-hint">密码只保留到本次连接请求完成，不写入连接或凭证库。</p>
            <label className="auth-password-field"><RequiredFieldLabel>密码</RequiredFieldLabel><input data-dialog-autofocus type="password" autoComplete="current-password" required value={password} disabled={submitting} onChange={(event) => setPassword(event.target.value)} placeholder="仅用于本次连接"/></label>
          </>}

          {method === "credential" && <>
            <p className="auth-security-hint">使用凭证库中的密码或私钥，但不会把本次选择保存到连接配置。</p>
            {vaultStatus.unlocked ? <label>选择凭证
              <select data-dialog-autofocus value={credentialId} disabled={submitting} onChange={(event) => setCredentialId(event.target.value)}>
                <option value="">请选择凭证</option>
                {credentials.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.kind === "password" ? "密码" : `私钥${item.detail ? ` / ${item.detail}` : ""}`}</option>)}
              </select>
            </label> : <div className="credential-unlock-card" data-dialog-autofocus tabIndex={-1}>
              <div><strong>{vaultStatus.initialized ? "凭证库已锁定" : vaultStatus.legacy ? "检测到旧版凭证库" : "凭证库尚未初始化"}</strong><p>{vaultStatus.initialized ? "解锁后可选择已有密码或私钥凭证。" : vaultStatus.legacy ? "请先在凭证管理中清除旧版数据并重新初始化。" : "请先从凭证管理创建凭证，或改用密码与 SSH Agent。"}</p></div>
              {vaultStatus.initialized && <Button onClick={() => setUnlocking(true)}>解锁凭证库</Button>}
            </div>}
            {vaultStatus.unlocked && credentials.length === 0 && <p className="dialog-note">凭证库中暂无可用凭证。</p>}
          </>}

          {method === "sshAgent" && <div className="agent-auth-note" data-dialog-autofocus tabIndex={-1}>
            <strong>使用系统 SSH Agent <span>推荐</span></strong>
            <p>按 Agent 中的密钥顺序尝试认证，应用不会读取或保存私钥。</p>
          </div>}
        </div>

        <footer className="dialog-actions dialog-actions-with-status auth-dialog-actions">
          <p className={`auth-dialog-action-note${message ? " error" : ""}`} role={message ? "alert" : undefined} aria-live="polite" title={message || undefined}>{message || "本次选择仅用于当前连接，不会修改连接配置。"}</p>
          <div><Button disabled={submitting} onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={submitting} disabled={!canSubmit(method, password, credentialId, vaultStatus)}>{submitting ? "正在连接…" : "连接"}</Button></div>
        </footer>
      </form>
    </DialogFrame>
    {unlocking && <MasterPasswordDialog mode="unlock" onClose={() => setUnlocking(false)} onSuccess={() => {
      setUnlocking(false);
      void refreshCredentials().catch((error) => setMessage(errorMessage(error)));
    }}/>}
  </>;
}

function initialMethod(profile: ConnectionProfile): AuthMethod {
  if (profile.authPreference === "sshAgent") return "sshAgent";
  if (profile.authPreference === "privateKey") return "credential";
  return "password";
}

function canSubmit(method: AuthMethod, password: string, credentialId: string, status: VaultStatus): boolean {
  if (method === "password") return password.length > 0;
  if (method === "credential") return status.unlocked && credentialId.length > 0;
  return true;
}

function createAuth(method: AuthMethod, password: string, credentialId: string): SessionAuth {
  if (method === "password") return { method, password };
  if (method === "credential") return { method: "storedCredential", credentialId };
  return { method };
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "无法发起连接";
}
