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
  const enabled = connected && (notifications.enabled || Boolean(directoryState));
  if (!enabled && position !== null) { setPosition(null); setOpen(false); }
  const unread = notifications.enabled && notifications.unread(blockId);
  const message = notifications.enabled
    ? unread ? "终端有未读通知，点击查看" : "终端通知已启用（实验功能）"
    : directoryMessage;
  const hide = () => setOpen(false);
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
    setPosition({ left, top: above ? Math.max(8, anchor.top - height - 6) : anchor.bottom + 6,
      transformOrigin: `${Math.max(12, Math.min(anchor.left + anchor.width / 2 - left, surface.offsetWidth - 12))}px ${above ? "bottom" : "top"}`,
      "--tooltip-offset": above ? "4px" : "-4px" } as CSSProperties);
  }, [open, directoryState, notifications.enabled]);
  useEffect(() => {
    if (open || !position) return;
    // Retain the surface for its exit; reopening cancels this removal.
    const timer = window.setTimeout(() => setPosition(null), 160);
    return () => window.clearTimeout(timer);
  }, [open, position]);
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
    {position && createPortal(<div ref={bubble} id={id} role="tooltip" aria-hidden={!open} data-open={open} className="themed-tooltip terminal-protocol-tooltip" style={position}>
      {directoryState && <p className="terminal-protocol-directory"><strong>OSC 7</strong><span>同步当前目录 · <small data-state={directoryState}>{directoryStatus}</small></span></p>}
      {notifications.enabled && <div className="terminal-protocol-notifications">
        <p><strong>BEL</strong><span>响铃信号，提醒关注终端</span></p>
        <p><strong>OSC 9</strong><span>发送通知正文</span></p>
        <p><strong>OSC 777</strong><span>发送通知标题和正文</span></p>
      </div>}
    </div>, document.body)}
  </>;
}
