import { Button } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";

export function AccessReplacedDialog({ onConfirm }: { onConfirm: () => void }) {
  return <DialogFrame compact title="连接已被接管" subtitle="其他用户已连接并接管此工作台" dismissible={false} onClose={onConfirm}>
    <p className="confirm-copy">当前连接已断开，后台终端任务继续运行。点击确认返回登录页面。</p>
    <footer className="dialog-actions">
      <Button variant="primary" onClick={onConfirm}>确认</Button>
    </footer>
  </DialogFrame>;
}
