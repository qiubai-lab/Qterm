import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Workspace } from "./model";
import { workspaceCloseLabels, workspaceCloseTargets, type WorkspaceCloseSide } from "./workspaceClose";

interface Props {
  anchorId: string; x: number; y: number; workspaces: Workspace[];
  onChoose: (side: WorkspaceCloseSide) => void;
  onDismiss: (restore?: boolean) => void;
}
export function WorkspaceTabMenu({ anchorId, x, y, workspaces, onChoose, onDismiss }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = menu.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    (node.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? node).focus();
    const outside = (event: PointerEvent) => { if (!node.contains(event.target as Node)) onDismiss(false); };
    const dismiss = () => onDismiss(false);
    const overlays = new MutationObserver(() => { if (document.querySelector('[role="dialog"]')) onDismiss(false); });
    overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role"] });
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => { overlays.disconnect(); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", dismiss); window.removeEventListener("blur", dismiss); window.removeEventListener("scroll", dismiss, true); };
  }, [x, y, onDismiss]);
  return createPortal(<div ref={menu} className="terminal-context-menu workspace-tab-menu" role="menu" aria-label="工作区操作" tabIndex={-1} style={{ left: x, top: y }}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); onDismiss(); return; }
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
    {(Object.keys(workspaceCloseLabels) as WorkspaceCloseSide[]).map(side => {
      const count = workspaceCloseTargets(workspaces, anchorId, side).length;
      return <button type="button" role="menuitem" key={side} disabled={!count} onClick={() => onChoose(side)}><span>{workspaceCloseLabels[side]}</span><small aria-hidden="true">{count}</small></button>;
    })}
  </div>, document.body);
}
