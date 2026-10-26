import { useEffect, useLayoutEffect, useRef } from "react";

import { resolveAppShortcut } from "../app/shortcuts";
import { hasNativeBlockClose, subscribeNativeBlockClose } from "../lib/tauri/blockClose";
import type { DesktopPlatform } from "../lib/tauri/window";
import { openTerminalSearch } from "../terminal/terminalViewRegistry";
import { findLeaf } from "./layout";
import { canCloseBlock } from "./workspaceClose";
import { nativeSurfaceBlockId } from "../web/surface/nativeSurfaceCoordinator";
import type { Workspace } from "./model";

interface WorkspaceShortcutsOptions {
  platform: DesktopPlatform;
  activeWorkspace: Workspace;
  workspaces: Workspace[];
  modalOpen: boolean;
  terminalLocked: boolean;
  onCloseBlock: (blockId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
}

export function useWorkspaceShortcuts({ platform, activeWorkspace, workspaces, modalOpen, terminalLocked, onCloseBlock, onSelectWorkspace }: WorkspaceShortcutsOptions) {
  const closeCurrentBlock = (source: string | null = null) => {
    if (modalOpen || terminalLocked) return;
    if (source !== null && nativeSurfaceBlockId(source) !== activeWorkspace.activeBlockId) return;
    const nativeWebFocus = findLeaf(activeWorkspace.layout, activeWorkspace.activeBlockId)?.type === "web" && !document.hasFocus();
    if (!nativeWebFocus && isEditableOutsideTerminal(document.activeElement)) return;
    if (document.querySelector('[role="dialog"], [role="menu"]')) return;
    if (canCloseBlock(activeWorkspace, activeWorkspace.activeBlockId)) onCloseBlock(activeWorkspace.activeBlockId);
  };
  const nativeCloseRef = useRef(closeCurrentBlock);
  useLayoutEffect(() => { nativeCloseRef.current = closeCurrentBlock; });
  useEffect(() => subscribeNativeBlockClose(source => nativeCloseRef.current(source)), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = resolveAppShortcut(event, platform);
      if (!command) return;
      const closing = command.type === "closeBlock";
      // WebTabs owns Ctrl+W in browsers, regardless of listener mount order.
      // Consume the browser default even if tab controls are not ready yet.
      if (closing && event.ctrlKey && findLeaf(activeWorkspace.layout, activeWorkspace.activeBlockId)?.type === "web") {
        event.preventDefault();
        return;
      }
      // Never let the close chord fall through to the shell or native window,
      // including repeats and states where closing the block is unavailable.
      if (closing) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.repeat || isEditableOutsideTerminal(event.target)) return;
      if (modalOpen || document.querySelector('.workspace-batch-close-dialog, [role="menu"]')) return;
      if (closing && document.querySelector('[role="dialog"]')) return;
      if (terminalLocked && command.type !== "selectWorkspace") return;

      let handled = true;
      if (command.type === "closeBlock") {
        // AppKit owns Cmd+W in the desktop app; DOM delivery is only a fallback
        // in browser mode. Ctrl+W continues to use the DOM on every platform.
        if (!(platform === "macos" && event.metaKey && hasNativeBlockClose())) nativeCloseRef.current();
      } else if (command.type === "searchTerminal") handled = openTerminalSearch(activeWorkspace.activeBlockId);
      else {
        const workspace = workspaces[command.index];
        if (workspace) onSelectWorkspace(workspace.id);
        else handled = false;
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeWorkspace, modalOpen, onCloseBlock, onSelectWorkspace, platform, terminalLocked, workspaces]);
}

export function isEditableOutsideTerminal(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".terminal-surface")) return false;
  return Boolean(target.closest("input,textarea,select,[contenteditable=true]"));
}
