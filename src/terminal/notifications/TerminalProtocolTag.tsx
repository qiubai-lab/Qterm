import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { focusTerminalBlock } from "../terminalViewRegistry";
import { useTerminalNotifications } from "./TerminalNotificationProvider";

interface Props {
  blockId: string;
  connected: boolean;
  directoryState?: "ready" | "waiting" | "attention" | null;
  directoryMessage?: string;
}

export function TerminalProtocolTag({ blockId, connected, directoryState, directoryMessage }: Props) {
  const notifications = useTerminalNotifications();
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const id = useId();
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const [open, setOpen] = useState(false);
  const enabled = connected;
  if (!enabled && position !== null) { setPosition(null); setOpen(false); }
  const unread = notifications.enabled && notifications.unread(blockId);
  const message = notifications.enabled
    ? unread ? "终端有未读通知，点击查看" : "终端通知已启用（实验功能）"
    : (directoryState ? directoryMessage : undefined) ?? "终端协议支持";
  const hide = () => { setOpen(false); setPosition(null); };
  const show = () => {
    if (open) return;
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 256)), top: rect.bottom + 6 });
      setOpen(true);
    }
  };
  useLayoutEffect(() => {
    const anchor = trigger.current?.getBoundingClientRect();
    const surface = bubble.current;
    if (!open || !anchor || !surface) return;
    const height = surface.offsetHeight;
    const above = anchor.bottom + 6 + height > window.innerHeight - 8;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - surface.offsetWidth - 8));
    setPosition({ left, top: above ? Math.max(8, anchor.top - height - 6) : anchor.bottom + 6 });
  }, [open, directoryState, notifications.enabled]);
  useEffect(() => {
    if (!position) return;
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    document.addEventListener("scroll", hide, true);
    return () => { window.removeEventListener("resize", hide); window.removeEventListener("blur", hide); document.removeEventListener("scroll", hide, true); };
  }, [position]);
  if (!enabled) return null;
  const directoryStatus = directoryState === "ready" ? "已收到目录" : directoryState === "attention" ? "未收到目录，使用回退目录" : "等待目录上报";
  return <>
    <button ref={trigger} type="button" className="terminal-osc7-tag terminal-notification-tag" data-state={directoryState ?? "ready"}
      aria-label={message} aria-live="polite" aria-describedby={open ? id : undefined}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); hide(); } }}
      onPointerDown={event => event.stopPropagation()}
      onClick={() => { if (unread) focusTerminalBlock(blockId); }}><span aria-hidden="true">osc</span></button>
    {open && position && createPortal(<div ref={bubble} id={id} role="tooltip" data-app-overlay="floating" data-overlay-motion="hover" className="themed-tooltip terminal-protocol-tooltip" style={position}>
      {directoryState && <p className="terminal-protocol-directory"><strong>OSC 7</strong><span>同步当前目录 · <small data-state={directoryState}>{directoryStatus}</small></span></p>}
      <div className="terminal-protocol-notifications">
        <p><strong>OSC 52</strong><span>应用复制到本机剪贴板 · 只写，不读取</span></p>
        <p><strong>OSC 8</strong><span>HTTP(S) 超链接，确认后打开</span></p>
        {notifications.enabled && <>
          <p><strong>BEL</strong><span>响铃信号，提醒关注终端</span></p>
          <p><strong>OSC 9</strong><span>发送通知正文</span></p>
          <p><strong>OSC 777</strong><span>发送通知标题和正文</span></p>
        </>}
      </div>
    </div>, document.body)}
  </>;
}
