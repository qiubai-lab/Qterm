import { useEffect, useId, useRef, useState } from "react";
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
  const id = useId();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const enabled = connected && (notifications.enabled || Boolean(directoryState));
  if (!enabled && position !== null) setPosition(null);
  const unread = notifications.enabled && notifications.unread(blockId);
  const message = notifications.enabled
    ? unread ? "终端有未读通知，点击查看" : "终端通知已启用（实验功能）"
    : directoryMessage;
  const hide = () => setPosition(null);
  const show = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 240)), top: Math.min(rect.bottom + 6, window.innerHeight - 130) });
  };
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
    <button ref={trigger} type="button" className="terminal-osc7-tag terminal-notification-tag" data-state={unread ? "unread" : directoryState ?? "ready"}
      aria-label={message} aria-live="polite" aria-describedby={position ? id : undefined}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); hide(); } }}
      onPointerDown={event => event.stopPropagation()}
      onClick={() => { if (unread) focusTerminalBlock(blockId); }}><span aria-hidden="true">osc{unread ? " ·" : ""}</span></button>
    {position && createPortal(<div id={id} role="tooltip" className="terminal-protocol-tooltip" style={position}>
      {directoryState && <p><strong>OSC 7</strong><span>同步当前目录 · {directoryStatus}</span></p>}
      {notifications.enabled && <>
        <p><strong>BEL</strong><span>响铃信号，提醒关注终端</span></p>
        <p><strong>OSC 9</strong><span>发送通知正文</span></p>
        <p><strong>OSC 777</strong><span>发送通知标题和正文</span></p>
      </>}
    </div>, document.body)}
  </>;
}
