import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { Button } from "./Button";
import { Icon } from "./Icon";

export interface HostIdentitySummary {
  name: string;
  username: string;
  host: string;
  port: number;
}

interface HostIdentityProps {
  profile: HostIdentitySummary;
  label?: string;
  className?: string;
}

const VIEWPORT_INSET = 8;
const POPOVER_GAP = 5;
const POPOVER_WIDTH = 276;

export function HostIdentity({ profile, label = `${profile.username}@${profile.host}`, className }: HostIdentityProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const endpoint = `${profile.username}@${profile.host}:${profile.port}`;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const anchor = trigger.getBoundingClientRect();
    const surface = popover.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, Math.max(0, window.innerWidth - VIEWPORT_INSET * 2));
    const height = surface.height;
    const left = Math.min(
      Math.max(VIEWPORT_INSET, anchor.left),
      Math.max(VIEWPORT_INSET, window.innerWidth - width - VIEWPORT_INSET),
    );
    const belowTop = anchor.bottom + POPOVER_GAP;
    const fitsBelow = belowTop + height <= window.innerHeight - VIEWPORT_INSET;
    setPosition({
      width,
      left,
      top: fitsBelow ? belowTop : Math.max(VIEWPORT_INSET, anchor.top - height - POPOVER_GAP),
      visibility: "visible",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function copyHost() {
    try {
      await writeClipboardText(profile.host);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const popover = open ? <div
    ref={popoverRef}
    className="host-summary-popover"
    role="dialog"
    aria-labelledby={titleId}
    style={position ?? { top: 0, left: 0, width: POPOVER_WIDTH, visibility: "hidden" }}
    onPointerDown={(event) => event.stopPropagation()}
  >
    <div className="host-summary-heading">
      <span className="host-summary-icon" aria-hidden="true"><Icon name="connections" size={13}/></span>
      <span><strong id={titleId}>{profile.name}</strong><small>目标主机概要</small></span>
    </div>
    <dl className="host-summary-details">
      <div><dt>用户名</dt><dd>{profile.username}</dd></div>
      <div><dt>主机</dt><dd>{profile.host}</dd></div>
      <div><dt>端口</dt><dd>{profile.port}</dd></div>
      <div className="host-summary-endpoint"><dt>完整地址</dt><dd>{endpoint}</dd></div>
    </dl>
    <div className="host-summary-actions">
      <span role="status" aria-live="polite">{copyState === "copied" ? "主机地址已复制" : copyState === "failed" ? "复制失败，请重试" : "复制纯主机/IP"}</span>
      <Button size="compact" variant="primary" onClick={() => void copyHost()}><Icon name="copy" size={11}/>{copyState === "copied" ? "已复制" : "复制主机地址"}</Button>
    </div>
  </div> : null;

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={["host-identity-trigger", className].filter(Boolean).join(" ")}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`查看 ${profile.name} 主机概要，${label}`}
      title="查看主机概要并复制地址"
      onClick={() => {
        setCopyState("idle");
        setPosition(null);
        setOpen((value) => !value);
      }}
    >{label}</button>
    {popover && createPortal(popover, document.body)}
  </>;
}
