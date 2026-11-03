import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icon";
import type { ServerEntry } from "./model";
interface Props { anchor: DOMRect; current: ServerEntry | null; status: string; servers: ServerEntry[]; onChoose: (entry: ServerEntry | null) => void; onManage: () => void; onAdd: () => void; onClose: () => void }
export function EnvironmentMenu({anchor, current, status, servers, onChoose, onManage, onAdd, onClose}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const recent = servers.filter(entry => entry.id !== current?.id).slice(0, 4);
  useLayoutEffect(() => { ref.current?.querySelector<HTMLElement>("button")?.focus(); }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside); window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  return createPortal(<div ref={ref} className="runtime-menu" data-app-overlay="floating" role="menu" aria-label="切换运行环境" style={{right: Math.max(8, window.innerWidth - anchor.right), top: anchor.bottom + 5}} onKeyDown={event => {
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <div className="runtime-menu-summary">
      <span className="runtime-summary-icon"><Icon name={current ? "server" : "computer"} size={14}/></span>
      <div><strong>{current?.name ?? "本机工作台"}</strong><code>{current?.endpoint ?? "终端与文件在本机运行"}</code></div>
      <span className="runtime-menu-status" data-status={status}><i aria-hidden="true"/>{status}</span>
    </div>
    {recent.length > 0 && <div className="runtime-menu-section" role="group" aria-label="最近服务器"><p className="runtime-menu-caption">最近服务器 <span>{recent.length}</span></p>{recent.map(entry => <button role="menuitem" key={entry.id} onClick={() => onChoose(entry)}><Icon name="server" size={12}/><span className="runtime-menu-copy"><span>{entry.name}</span><small>{new URL(entry.endpoint).host}</small></span><Icon name="forward" size={12}/></button>)}</div>}
    <div className="runtime-menu-section" role="group" aria-label="服务器操作">
      <button role="menuitem" onClick={onAdd}><Icon name="plus" size={12}/><span>连接服务器…</span><Icon name="forward" size={12}/></button>
      <button role="menuitem" onClick={onManage}><Icon name="settings" size={12}/><span>管理服务器…</span><Icon name="forward" size={12}/></button>
    </div>
    {current && <div className="runtime-menu-section"><button role="menuitem" aria-label="切换到本机" onClick={() => onChoose(null)}><Icon name="disconnect" size={12}/><span className="runtime-menu-copy"><span>断开并返回本机</span><small>服务器后台任务继续运行</small></span></button></div>}
  </div>, document.body);
}
