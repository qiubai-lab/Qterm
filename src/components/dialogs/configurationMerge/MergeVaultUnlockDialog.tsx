import { useState } from "react";
import { Icon } from "../../Icon";
import { DialogFrame } from "../DialogFrame";
import { MasterPasswordForm } from "../MasterPasswordDialog";
import { MergeCredentialForm } from "./MergeCredentialUnlock";
import { useMergeVaultMotion } from "./useMergeVaultMotion";

export function MergeVaultUnlockDialog({ mode, target, source, busy, error, onCurrentReady, onVerify, onVerified, onClose }: {
  mode: "unlock" | null; target: string; source: string; busy: boolean; error: string;
  onCurrentReady: () => void; onVerify: (password: string, onVerified: () => void) => void; onVerified: () => void; onClose: () => void;
}) {
  const [currentBusy, setCurrentBusy] = useState(false);
  const current = mode !== null;
  const { motion, advance, closing, closeWithTransition } = useMergeVaultMotion();
  const close = () => closeWithTransition(onClose);
  return <DialogFrame title="解锁合并凭证" className="configuration-merge-vault-dialog" blocking={false} closing={closing} dismissible={!busy && !closing && motion !== "leaving" && !(current && currentBusy)} onClose={close}>
    <ol className="configuration-merge-steps" aria-label="凭证解锁步骤">
      <li data-state={current ? "current" : "complete"} aria-current={current ? "step" : undefined}><span className="configuration-merge-step-number">{current ? "1" : <Icon name="check" size={12}/>}</span><span>当前保险库{!current && " · 已就绪"}</span></li>
      <li data-state={current ? "pending" : "current"} aria-current={!current ? "step" : undefined}><span className="configuration-merge-step-number">2</span><span>来源保险库</span></li>
    </ol>
    <div className="configuration-merge-vault-content" data-motion={motion} inert={closing || motion === "leaving"}>
      <div className="configuration-merge-vault-context"><strong>{current ? "解锁当前保险库" : "解锁来源保险库"}</strong><input aria-label={current ? "当前保险库配置目录" : "来源保险库配置目录"} readOnly value={current ? target : source}/></div>
      {current ? <MasterPasswordForm mode={mode} onSuccess={() => advance(onCurrentReady)} onClose={close} onSubmittingChange={setCurrentBusy} submitLabel="解锁并继续"/> : <MergeCredentialForm busy={busy || closing} error={error} onVerify={(password) => onVerify(password, () => closeWithTransition(onVerified))} onClose={close}/>}
    </div>
  </DialogFrame>;
}
