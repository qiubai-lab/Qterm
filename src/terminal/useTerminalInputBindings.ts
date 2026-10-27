import { useEffect, type RefObject } from "react";
import { resolveAppShortcut } from "../app/shortcuts";
import type { DesktopPlatform } from "../lib/tauri/window";
import { bindTerminalClipboardEvents, handleClipboardShortcut, type ClipboardPlatform } from "./terminalClipboardShortcuts";
import type { TerminalView } from "./terminalView";

export function useTerminalInputBindings(viewRef: RefObject<TerminalView | null>, sessionKey: string, clipboardPlatform: ClipboardPlatform, desktopPlatform: DesktopPlatform, inputEnabled: boolean, copy: () => Promise<void>, paste: () => Promise<void>, openSearch: () => void) {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Linux middle-click pastes PRIMARY, which is distinct from the clipboard
    // read by the staging API. Preserve xterm's existing selection paste path.
    const unbindClipboard = clipboardPlatform === "linux" ? () => undefined
      : bindTerminalClipboardEvents(view.element, inputEnabled, paste, () => view.terminal.selectAll());
    view.onKey = (event) => {
      if (resolveAppShortcut(event, desktopPlatform)?.type === "searchTerminal") {
        event.preventDefault();
        event.stopPropagation();
        openSearch();
        return false;
      }
      if (!handleClipboardShortcut(event, clipboardPlatform, view.terminal, inputEnabled, copy, paste)) return false;
      return handleMacWordNavigationShortcut(event, clipboardPlatform, (data) => { void view.inputScheduler.send(data); });
    };
    return () => {
      unbindClipboard();
      view.onKey = () => true;
    };
  }, [viewRef, sessionKey, clipboardPlatform, copy, desktopPlatform, inputEnabled, openSearch, paste]);
}

function handleMacWordNavigationShortcut(event: KeyboardEvent, platform: ClipboardPlatform, write: (data: string) => void): boolean {
  const hasSingleWordModifier = event.ctrlKey !== event.altKey;
  if (platform !== "mac" || event.type !== "keydown" || !hasSingleWordModifier || event.shiftKey || event.metaKey) return true;
  const input = event.key === "ArrowLeft" ? "\x1bb" : event.key === "ArrowRight" ? "\x1bf" : null;
  if (!input) return true;
  event.preventDefault();
  event.stopPropagation();
  write(input);
  return false;
}
