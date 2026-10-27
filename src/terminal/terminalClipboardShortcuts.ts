import type { Terminal } from "@xterm/xterm";

export type ClipboardPlatform = "mac" | "windows" | "linux";

export function bindTerminalClipboardEvents(element: HTMLElement, inputEnabled: boolean, paste: () => Promise<void>, selectAll: () => void): () => void {
  // Native Edit menus can dispatch paste without any keydown. Capture before
  // xterm's textarea listener, which only reads text/plain and bypasses staging.
  const onPaste = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (inputEnabled) void paste();
  };
  const onSelectAll = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    selectAll();
  };
  element.addEventListener("paste", onPaste, true);
  element.addEventListener("qterm-terminal-select-all", onSelectAll, true);
  return () => {
    element.removeEventListener("paste", onPaste, true);
    element.removeEventListener("qterm-terminal-select-all", onSelectAll, true);
  };
}

export function terminalClipboardPlatform(): ClipboardPlatform {
  const navigatorWithData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const value = `${navigatorWithData.userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  if (value.includes("mac")) return "mac";
  if (value.includes("win")) return "windows";
  return "linux";
}

export function handleClipboardShortcut(event: KeyboardEvent, platform: ClipboardPlatform, terminal: Terminal, inputEnabled: boolean, copy: () => Promise<void>, paste: () => Promise<void>): boolean {
  if (event.type !== "keydown" || event.altKey) return true;
  const key = event.key.toLowerCase();
  const macShortcut = platform === "mac" && event.metaKey && !event.ctrlKey;
  const terminalShortcut = platform !== "mac" && event.ctrlKey && event.shiftKey && !event.metaKey;
  const windowsDesktopShortcut = platform === "windows" && event.ctrlKey && !event.shiftKey && !event.metaKey;
  if (key === "c" && terminal.hasSelection() && (macShortcut || terminalShortcut || windowsDesktopShortcut)) {
    event.preventDefault();
    event.stopPropagation();
    void copy();
    return false;
  }
  if (key === "v" && inputEnabled && (macShortcut || terminalShortcut || windowsDesktopShortcut)) {
    event.preventDefault();
    event.stopPropagation();
    void paste();
    return false;
  }
  return true;
}

