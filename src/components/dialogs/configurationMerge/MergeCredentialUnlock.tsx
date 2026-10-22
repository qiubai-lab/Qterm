import { useState } from "react";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { RequiredFieldLabel } from "../../RequiredFieldLabel";
import { DialogActionStatus } from "../DialogFrame";

export function MergeCredentialForm({ busy, error, onVerify, onClose }: { busy: boolean; error: string; onVerify: (password: string) => void; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  return     <form onSubmit={(event) => { event.preventDefault(); if (!password || busy) return; onVerify(password); setPassword(""); }}>
      <label><RequiredFieldLabel>来源配置主密码</RequiredFieldLabel><span className="configuration-merge-password"><input autoFocus data-dialog-autofocus required type={visible ? "text" : "password"} autoComplete="off" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)}/><button type="button" aria-label={visible ? "隐藏密码" : "显示密码"} onClick={() => setVisible(!visible)}><Icon name={visible ? "eyeOff" : "eye"} size={14}/></button></span></label>
      <div className="configuration-merge-credential-intro"><Icon name="key" size={14}/><p>凭证将在本机重新加密，合并到当前凭证库。当前主密码与恢复密钥保持不变。</p></div>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={error}/><div><Button variant="danger" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" variant="primary" loading={busy} disabled={busy || !password}>验证并解锁</Button></div></footer>
    </form>;
}
