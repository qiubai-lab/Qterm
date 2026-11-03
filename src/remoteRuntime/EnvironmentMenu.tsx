import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ServerEntry } from "./model";
interface Props { anchor: DOMRect; current: ServerEntry | null; status: string; servers: ServerEntry[]; onChoose: (entry: ServerEntry | null) => void; onManage: () => void; onAdd: () => void; onClose: () => void }
export function EnvironmentMenu({anchor, current, status, servers, onChoose, onManage, onAdd, onClose}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { ref.current?.querySelector<HTMLElement>("button")?.focus(); }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", onClose);
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
    <div className="runtime-menu-summary"><strong>{current?.name ?? "本机"}</strong><span>{status}</span><code>{current?.endpoint ?? "在这台电脑上运行"}</code></div>
    {current && <button role="menuitem" onClick={() => onChoose(null)}>切换到本机</button>}
    {servers.filter(entry => entry.id !== current?.id).slice(0, 5).map(entry => <button role="menuitem" key={entry.id} onClick={() => onChoose(entry)}><span>{entry.name}</span><small>{new URL(entry.endpoint).host}</small></button>)}
    <div className="runtime-menu-divider"/>
    <button role="menuitem" onClick={onAdd}>连接服务器…</button>
    <button role="menuitem" onClick={onManage}>管理服务器…</button>
    {current && <><div className="runtime-menu-divider"/><button role="menuitem" onClick={() => onChoose(null)}>断开连接，返回本机</button></>}
  </div>, document.body);
}
