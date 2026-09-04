import { useDialogCloseTransition } from "../components/dialogs/useDialogCloseTransition";
import { createPortal } from "react-dom";
import { Button } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import type { Workspace } from "./model";
interface Props {
  title: string; targets: Workspace[]; sessions: number; busy: boolean; error: string;
  onCancel: () => void; onConfirm: () => Promise<(() => void) | undefined>;
}
export function WorkspaceBatchCloseDialog({ title, targets, sessions, busy, error, onCancel, onConfirm }: Props) {
  const { closing, closeWithTransition } = useDialogCloseTransition();
  const cancel = () => { if (!busy && !closing) closeWithTransition(onCancel); };
  const confirm = async () => {
    if (busy || closing) return;
    const complete = await onConfirm();
    if (complete) closeWithTransition(complete);
  };
  return createPortal(<div onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <DialogFrame compact className="workspace-batch-close-dialog" title={`${title}？`} subtitle={`将关闭 ${targets.length} 个工作区，断开 ${sessions} 个活动会话`} closing={closing} dismissible={!busy} onClose={cancel}>
      <p className="confirm-copy">这些工作区的布局将被移除，未保存的内容和终端输出可能丢失，正在执行的任务可能中断。</p>
      {error && <p className="inline-message error" role="alert">{error}</p>}
      <footer className="dialog-actions end">
        <Button variant="danger" disabled={busy || closing} onClick={cancel} data-dialog-autofocus>取消</Button>
        <Button variant="dangerSolid" loading={busy} disabled={!targets.length || closing} onClick={() => void confirm()}>{busy ? "正在关闭…" : `关闭 ${targets.length} 个工作区`}</Button>
      </footer>
    </DialogFrame>
  </div>, document.body);
}
