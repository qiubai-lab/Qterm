import { useState } from "react";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { OverlayScrollArea } from "../../scrollbars/OverlayScrollArea";
import { DialogActionStatus, DialogFrame } from "../DialogFrame";
import { MasterPasswordDialog } from "../MasterPasswordDialog";
import { useConfigurationMerge } from "./useConfigurationMerge";
import { MergeSteps } from "./MergeSteps";
import { MergeDirectoryCard } from "./MergeDirectoryCard";
import { MergeVaultUnlockDialog } from "./MergeVaultUnlockDialog";
import { MergeConfirmation } from "./MergeConfirmation";
import { MergeDetails } from "./MergeDetails";
import "./configurationMerge.css";

export function ConfigurationMergeDialog({ target, onClose }: { target: string; onClose: () => void }) {
  const c = useConfigurationMerge();
  const [previewOpen, setPreviewOpen] = useState(false);
  const source = c.step === "source";
  const done = c.step === "done";
  const invalidCount = c.preview?.details.filter((d) => d.outcome === "invalid").length ?? 0;
  return <>
    <DialogFrame title="合并配置" subtitle="导入其他 Qterm 配置，保留当前数据" className="configuration-merge-dialog" blocking={false} dismissible={!c.busy && !c.vaultMode && !c.unlockOpen && !previewOpen} onClose={onClose}>
      <MergeSteps step={c.step}/>
      <OverlayScrollArea className="configuration-merge-scroll" viewportClassName={`configuration-merge-body${done ? " configuration-merge-complete-stage" : ""}`} viewportProps={{ tabIndex: 0, "aria-label": "合并内容与变更详情" }}>
        {source ? <div className="configuration-merge-source-stage">
          <MergeDirectoryCard path={target}/>
          <MergeDirectoryCard source path={c.scan?.source ?? ""} disabled={c.busy} onChoose={c.choose}/>
        </div> : <>
          {done && <div className="configuration-merge-success"><span className="configuration-merge-success-icon"><Icon name="check" size={24}/></span><div><strong>配置已合并</strong><p>已即时生效，现有会话继续运行。</p></div></div>}
          {c.scan && !done && <MergeConfirmation scan={c.scan} options={c.options} busy={c.busy} onChange={c.change} onPreview={c.preview ? () => setPreviewOpen(true) : undefined}/>}
        </>}
      </OverlayScrollArea>
      <footer className="dialog-actions dialog-actions-with-status">
        {!c.error && !done && invalidCount > 0 ? <p className="configuration-merge-footer-note configuration-merge-invalid-note" role="status">{done ? "已跳过" : "将跳过"} {invalidCount} 条失效网络规则，详情见预览。</p> : !c.error && !source && !done && c.options.connections && !c.options.credentials ? <p className="configuration-merge-footer-note"><Icon name="help" size={12}/><span>未合并凭证的新增连接需要重新绑定凭证。</span></p> : <DialogActionStatus message={c.error}/>}
        <div>{done ? <Button variant="primary" onClick={onClose}>完成</Button> : <>
          <Button variant="danger" disabled={c.busy} onClick={onClose}>取消</Button>
          {source ? c.scan && <Button variant="primary" disabled={c.busy} onClick={c.next}>合并配置</Button> : <>
            <Button disabled={c.busy} onClick={c.back}>上一步</Button>
            {c.error && !c.preview ? <Button disabled={c.busy} onClick={c.retry}>{c.needsCredentialVerification ? "重新验证" : "重新检查"}</Button> : null}
            <Button variant="primary" loading={c.busy} disabled={c.busy || !c.preview?.changed} onClick={c.commit}>确认合并</Button>
          </>}
        </>}</div>
      </footer>
    </DialogFrame>
    {previewOpen && c.preview && <DialogFrame title={done ? "合并结果" : "变更预览"} className="configuration-merge-preview-dialog" onClose={() => setPreviewOpen(false)}>
      <MergeDetails preview={c.preview} done={done}/>
      <footer className="dialog-actions"><Button onClick={() => setPreviewOpen(false)}>关闭</Button></footer>
    </DialogFrame>}
    {c.vaultMode === "initialize" ? <MasterPasswordDialog mode="initialize" onSuccess={c.currentVaultReady} onClose={() => c.setVaultMode(null)}/> : (c.vaultMode || c.unlockOpen) && <MergeVaultUnlockDialog mode={c.vaultMode} target={target} source={c.scan?.source ?? ""} busy={c.busy} error={c.credentialError} onCurrentReady={c.currentVaultReady} onVerify={c.verify} onVerified={c.completeUnlock} onClose={c.vaultMode ? () => c.setVaultMode(null) : c.closeUnlock}/>}
  </>;
}
