import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import { openExternalHttpUrl } from "../lib/externalUrl";
import type { WebLinkOrigin } from "../web/webLinkOrigin";
import { subscribeToTerminalExternalLinkRequests, type TerminalExternalLinkRequest } from "./terminalExternalLinkRequests";

type Request = TerminalExternalLinkRequest & { origin: WebLinkOrigin | null };
interface Props {
  internalSupported?: boolean;
  resolveOrigin?: (blockId?: string) => WebLinkOrigin | null;
  onOpenInternal?: (origin: WebLinkOrigin, uri: string) => void | Promise<void>;
}

export function TerminalExternalLinkConfirmationHost({ internalSupported = false, resolveOrigin, onOpenInternal }: Props) {
  const [request, setRequest] = useState<Request | null>(null);
  const [busy, setBusy] = useState<"internal" | "external" | null>(null);
  const [message, setMessage] = useState("");
  const resolver = useRef(resolveOrigin);
  useLayoutEffect(() => { resolver.current = resolveOrigin; }, [resolveOrigin]);
  const revision = useRef(0);
  const submitting = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToTerminalExternalLinkRequests(next => {
      // A new request invalidates completion from an older dismissed decision.
      revision.current++;
      submitting.current = false;
      setBusy(null);
      setMessage("");
      setRequest({ ...next, origin: resolver.current?.(next.blockId) ?? null });
    });
    const lifetime = revision;
    return () => { lifetime.current++; unsubscribe(); };
  }, []);

  if (!request) return null;
  const close = () => {
    revision.current++;
    submitting.current = false;
    setBusy(null);
    setMessage("");
    setRequest(null);
  };
  const confirm = async (destination: "internal" | "external") => {
    if (submitting.current) return;
    submitting.current = true;
    const attempt = ++revision.current;
    setBusy(destination);
    setMessage("");
    try {
      if (destination === "internal") {
        if (!internalSupported || !request.origin || !onOpenInternal) throw new Error("无法确定内部浏览器的连接，请重新选择终端链接");
        await onOpenInternal(request.origin, request.uri);
      } else if (!await openExternalHttpUrl(request.uri)) {
        throw new Error("无法调用系统浏览器，请检查系统设置后重试");
      }
      if (attempt === revision.current) setRequest(null);
    } catch (error) {
      if (attempt === revision.current) setMessage(destination === "external" ? "无法调用系统浏览器，请检查系统设置后重试" : error instanceof Error ? error.message : String(error));
    } finally {
      if (attempt === revision.current) { submitting.current = false; setBusy(null); }
    }
  };
  const internalReason = !internalSupported ? "内部浏览器目前仅支持 Windows 桌面版" : !request.origin ? "无法确定来源终端" : "";

  return <DialogFrame compact className="terminal-external-link-confirmation" title="打开链接？"
    subtitle={request.source === "osc8" ? "终端 OSC 8 链接请求" : "终端文本链接请求"} onClose={close}>
    <p className="confirm-copy">选择打开方式。终端输出可能由远程主机或程序生成，请确认域名和路径可信。</p>
    <div className="terminal-external-link-target">
      <span>实际访问地址</span>
      <code title={request.uri}>{request.uri}</code>
    </div>
    <p className="terminal-link-route">{internalReason || `内部：${request.origin?.name} · 外部：系统默认浏览器`}</p>
    <footer className="terminal-link-actions">
      <DialogActionStatus message={message}/>
      <div className="terminal-link-choices">
        <Button variant="primary" disabled={Boolean(busy) || Boolean(internalReason)} loading={busy === "internal"} onClick={() => void confirm("internal")}><Icon name="browser" size={14}/>{busy === "internal" ? "正在打开…" : "内部浏览器打开"}</Button>
        <Button disabled={Boolean(busy)} loading={busy === "external"} onClick={() => void confirm("external")}><Icon name="externalLink" size={14}/>{busy === "external" ? "正在打开…" : "外部浏览器打开"}</Button>
      </div>
    </footer>
  </DialogFrame>;
}
