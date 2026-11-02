import { Button } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";
export function AccessTakeoverDialog({busy,onCancel,onTakeover}:{busy:boolean;onCancel:()=>void;onTakeover:()=>void}) {
  return <DialogFrame compact title="当前工作台正在使用中" subtitle="已有其他连接正在使用此工作台" dismissible={!busy} onClose={onCancel}>
    <p className="confirm-copy">接管后，对方将断开连接。后台终端任务、工作区和已同步的文件草稿继续保留。</p>
    <p className="confirm-copy">若凭证库已初始化，接管后需验证主密码才能使用工作台。</p>
    <footer className="dialog-actions"><Button variant="danger" disabled={busy} onClick={onCancel}>取消</Button><Button variant="primary" loading={busy} onClick={onTakeover}>直接接管</Button></footer>
  </DialogFrame>;
}
