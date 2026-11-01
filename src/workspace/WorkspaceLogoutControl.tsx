import { useState } from "react";
import { Icon } from "../components/Icon";
import { Button } from "../components/Button";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
const message = (error:unknown) => error instanceof Error ? error.message : "退出登录失败";

export function WorkspaceLogoutControl({onLogout}:{onLogout:()=>Promise<void>}) {
  const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  async function logout(){setBusy(true);setError("");try{await onLogout();}catch(reason){setError(message(reason));}finally{setBusy(false);}}
  return <><div className="window-controls"><button aria-label="退出登录" title="退出登录" onClick={()=>setOpen(true)}><Icon name="lock" size={14}/></button></div>
    {open&&<DialogFrame compact title="退出登录" subtitle="退出访问并锁定凭证库" onClose={busy?()=>undefined:()=>setOpen(false)}><p className="confirm-copy">本地 Shell 和 SSH 后台任务会继续运行。重新登录即可恢复；进行中的文件传输将取消。</p><footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={error}/><div><Button variant="danger" disabled={busy} onClick={()=>setOpen(false)}>取消</Button><Button variant="primary" loading={busy} onClick={()=>void logout()}>退出登录</Button></div></footer></DialogFrame>}
  </>;
}
