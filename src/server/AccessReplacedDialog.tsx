import { Button } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { Icon } from "../components/Icon";

export function AccessReplacedDialog({ reason = "replaced", reconnecting = false, onConfirm }: { reason?: "replaced" | "disconnected"; reconnecting?: boolean; onConfirm: () => void }) {
  const replaced = reason === "replaced";
  const title = replaced ? "连接已被接管" : "连接已断开";
  const subtitle = replaced ? "其他会话已连接并接管此工作台" : reconnecting ? "与服务端的连接中断，正在尝试重新连接" : "登录会话已失效，请重新登录";
  return <DialogFrame compact title={title} titleIcon={<Icon name={replaced ? "sync" : "disconnect"} size={18}/>} subtitle={subtitle} dismissible={false} onClose={onConfirm}>
    <p className="confirm-copy">{replaced ? "当前连接已断开，后台终端任务继续运行。点击确认返回登录页面。" : reconnecting ? "连接恢复后将自动返回工作台。也可点击确认返回登录页面。" : "当前页面已停止访问工作台。点击确认返回登录页面。"}</p>
    <footer className="dialog-actions">
      <Button variant="primary" onClick={onConfirm}>确认</Button>
    </footer>
  </DialogFrame>;
}
