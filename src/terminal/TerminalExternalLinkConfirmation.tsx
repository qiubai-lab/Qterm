import { useEffect, useState } from "react";

import { Button } from "../components/Button";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import { openExternalHttpUrl } from "../lib/externalUrl";
import { subscribeToTerminalExternalLinkRequests, type TerminalExternalLinkRequest } from "./terminalExternalLinkRequests";

export function TerminalExternalLinkConfirmationHost() {
  const [request, setRequest] = useState<TerminalExternalLinkRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const receive = (next: TerminalExternalLinkRequest) => {
      setMessage("");
      setRequest(next);
    };
    return subscribeToTerminalExternalLinkRequests(receive);
  }, []);

  if (!request) return null;
  const close = () => {
    if (busy) return;
    setMessage("");
    setRequest(null);
  };
  const confirm = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (await openExternalHttpUrl(request.uri)) setRequest(null);
      else setMessage("无法调用系统浏览器，请检查系统设置后重试");
    } catch {
      setMessage("无法调用系统浏览器，请检查系统设置后重试");
    } finally {
      setBusy(false);
    }
  };

  return <DialogFrame
    compact
    className="terminal-external-link-confirmation"
    title="打开外部链接？"
    subtitle={request.source === "osc8" ? "终端 OSC 8 链接请求" : "终端文本链接请求"}
    dismissible={!busy}
    onClose={close}
  >
    <p className="confirm-copy">将调用系统默认浏览器访问下方链接。终端输出可能由远程主机或程序生成，请确认域名和路径可信。</p>
    <div className="terminal-external-link-target">
      <span>实际访问地址</span>
      <code title={request.uri}>{request.uri}</code>
    </div>
    <footer className="dialog-actions dialog-actions-with-status">
      <DialogActionStatus message={message}/>
      <div><Button variant="danger" disabled={busy} onClick={close}>取消</Button><Button variant="primary" data-dialog-autofocus loading={busy} onClick={() => void confirm()}>{busy ? "正在打开…" : "继续访问"}</Button></div>
    </footer>
  </DialogFrame>;
}
