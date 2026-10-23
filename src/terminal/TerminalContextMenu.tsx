import { type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { shortcutLabel } from "../app/shortcuts";
import type { DesktopPlatform } from "../lib/tauri/window";

interface TerminalMenuActions {
  copy: () => void | Promise<void>;
  paste: () => void | Promise<void>;
  exportImage: () => void;
  search: () => void;
  selectAll: () => void;
  clear: () => void;
}

export function TerminalContextMenu({ state, menuRef, platform, canPaste, actions, close }: {
  state: { x: number; y: number; placement: "above" | "below"; hasSelection: boolean };
  menuRef: RefObject<HTMLDivElement | null>;
  platform: DesktopPlatform;
  canPaste: boolean;
  actions: TerminalMenuActions;
  close: () => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)"));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      items[(index + offset + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") close();
  }
  const modifier = platform === "macos" ? "⌘" : platform === "windows" ? "Ctrl+" : "Ctrl+Shift+";
  return createPortal(<div ref={menuRef} className="terminal-context-menu" data-placement={state.placement} role="menu" aria-label="终端菜单" style={{ left: state.x, top: state.y }} onContextMenu={event => event.preventDefault()} onKeyDown={handleKeyDown}>
    <button role="menuitem" disabled={!state.hasSelection} onClick={() => void actions.copy()}><span>复制</span><kbd>{modifier}C</kbd></button>
    <button role="menuitem" disabled={!state.hasSelection} onClick={actions.exportImage}><span>导出选中行为图片…</span></button>
    <button role="menuitem" disabled={!canPaste} onClick={() => void actions.paste()}><span>粘贴</span><kbd>{modifier}V</kbd></button>
    <div className="terminal-context-menu-separator" role="separator"/>
    <button role="menuitem" onClick={actions.search}><span>搜索</span><kbd>{shortcutLabel("searchTerminal", platform)}</kbd></button>
    <div className="terminal-context-menu-separator" role="separator"/>
    <button role="menuitem" onClick={actions.selectAll}><span>全选</span></button>
    <div className="terminal-context-menu-separator" role="separator"/>
    <button role="menuitem" onClick={actions.clear}><span>清除终端缓冲区</span></button>
  </div>, document.body);
}
