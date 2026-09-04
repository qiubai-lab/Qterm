import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import type { WorkspaceNotice } from "./workspaceNotice";

interface Props {
  notice: WorkspaceNotice;
  name: string;
  showBody: boolean;
  anchor: RefObject<HTMLSpanElement | null>;
  dismiss: (revision?: number) => void;
  activate: () => void;
}

export function WorkspaceNotificationBubble({ notice, name, showBody, anchor, dismiss, activate }: Props) {
  const bubble = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 44 });
  const timing = useRef({ remaining: 4000, started: 0, timer: 0, hovered: false, focused: false });
  const stop = () => {
    const state = timing.current;
    if (state.timer) { window.clearTimeout(state.timer); state.timer = 0; state.remaining = Math.max(0, state.remaining - (performance.now() - state.started)); }
  };
  const resume = () => {
    const state = timing.current;
    if (state.hovered || state.focused || state.timer) return;
    state.started = performance.now();
    state.timer = window.setTimeout(() => dismiss(notice.revision), state.remaining);
  };
  useLayoutEffect(() => {
    const state = timing.current;
    state.remaining = 4000;
    state.started = performance.now();
    state.timer = state.hovered || state.focused ? 0 : window.setTimeout(() => dismiss(notice.revision), 4000);
    return () => { window.clearTimeout(state.timer); state.timer = 0; };
  }, [notice.revision, dismiss]);
  useLayoutEffect(() => {
    const tab = anchor.current?.closest<HTMLElement>(".workspace-tab");
    const strip = tab?.closest<HTMLElement>(".workspace-tab-strip");
    const update = () => {
      if (document.querySelector('.workspace-stage-content[inert], [role="dialog"]')) { dismiss(notice.revision); return; }
      const rect = tab?.getBoundingClientRect();
      const bounds = strip?.getBoundingClientRect();
      if (!rect || !bounds) return;
      const width = bubble.current?.offsetWidth || 240;
      const center = Math.max(bounds.left, Math.min(bounds.right, rect.left + rect.width / 2));
      setPosition({ left: Math.max(8, Math.min(window.innerWidth - width - 8, center - width / 2)), top: bounds.bottom + 6 });
    };
    update();
    const resize = new ResizeObserver(update);
    if (tab) resize.observe(tab);
    if (strip) resize.observe(strip);
    const overlays = new MutationObserver(() => {
      if (document.querySelector('.workspace-stage-content[inert], [role="dialog"]')) dismiss(notice.revision);
    });
    overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["inert", "role"] });
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => { resize.disconnect(); overlays.disconnect(); window.removeEventListener("resize", update); document.removeEventListener("scroll", update, true); };
  }, [anchor, dismiss, notice.revision]);
  return createPortal(<div ref={bubble} className="workspace-notification-bubble" style={position}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onMouseEnter={() => { timing.current.hovered = true; stop(); }}
    onMouseLeave={() => { timing.current.hovered = false; resume(); }}
    onFocus={() => { timing.current.focused = true; stop(); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { timing.current.focused = false; resume(); } }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); dismiss(notice.revision); anchor.current?.closest<HTMLButtonElement>("button")?.focus(); } }}>
    <button type="button" className="workspace-notification-open" onClick={activate} aria-label={`查看 ${name} 的终端通知`}>
      <span className="workspace-notification-symbol" aria-hidden="true"><Icon name="terminal" size={15}/><i/></span>
      <span className="workspace-notification-copy">
        <small>终端通知{notice.count > 1 ? ` · ${notice.count} 条` : ""}</small>
        <strong>{name}</strong>
        <span className="workspace-notification-body" role="status">{showBody && notice.body ? notice.body : "该工作区有终端通知"}</span>
      </span>
    </button>
    <button type="button" className="workspace-notification-close" aria-label="关闭通知气泡" onClick={() => { dismiss(notice.revision); anchor.current?.closest<HTMLButtonElement>("button")?.focus(); }}><Icon name="close" size={12}/></button>
  </div>, document.body);
}
