import type { DesktopPlatform } from "../lib/tauri/window";

export type AppShortcutCommand =
  | { type: "newWorkspace" }
  | { type: "openConnections" }
  | { type: "splitBlock"; direction: "horizontal" | "vertical" }
  | { type: "selectWorkspace"; index: number }
  | { type: "cycleWorkspace"; offset: -1 | 1 }
  | { type: "focusBlock"; direction: "left" | "right" | "up" | "down" }
  | { type: "cycleBlock"; offset: -1 | 1 }
  | { type: "searchTerminal" };

type ShortcutEvent = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "type">;

export function resolveAppShortcut(event: ShortcutEvent, platform: DesktopPlatform): AppShortcutCommand | null {
  if (event.type !== "keydown") return null;
  const key = event.key.toLowerCase();
  const mac = platform === "macos";
  const primary = mac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!primary) return null;

  if (mac) {
    if (event.altKey && !event.shiftKey) {
      if (event.key === "PageUp") return { type: "cycleBlock", offset: -1 };
      if (event.key === "PageDown") return { type: "cycleBlock", offset: 1 };
      if (event.key === "ArrowLeft") return { type: "focusBlock", direction: "left" };
      if (event.key === "ArrowRight") return { type: "focusBlock", direction: "right" };
      if (event.key === "ArrowUp") return { type: "focusBlock", direction: "up" };
      if (event.key === "ArrowDown") return { type: "focusBlock", direction: "down" };
    }
    if (event.altKey) return null;
    if (!event.shiftKey && key === "t") return { type: "newWorkspace" };
    if (!event.shiftKey && key === "k") return { type: "openConnections" };
    if (!event.shiftKey && key === "d") return { type: "splitBlock", direction: "horizontal" };
    if (event.shiftKey && key === "d") return { type: "splitBlock", direction: "vertical" };
    if (!event.shiftKey && key === "f") return { type: "searchTerminal" };
    if (!event.shiftKey && /^[1-9]$/.test(key)) return { type: "selectWorkspace", index: Number(key) - 1 };
    if (event.shiftKey && (event.key === "[" || event.key === "]")) return { type: "cycleWorkspace", offset: event.key === "]" ? 1 : -1 };
    return null;
  }

  if (!event.shiftKey) return null;
  if (!event.altKey) {
    if (event.key === "PageUp") return { type: "cycleBlock", offset: -1 };
    if (event.key === "PageDown") return { type: "cycleBlock", offset: 1 };
    if (event.key === "ArrowLeft") return { type: "focusBlock", direction: "left" };
    if (event.key === "ArrowRight") return { type: "focusBlock", direction: "right" };
    if (event.key === "ArrowUp") return { type: "focusBlock", direction: "up" };
    if (event.key === "ArrowDown") return { type: "focusBlock", direction: "down" };
  }
  if (!event.altKey && key === "t") return { type: "newWorkspace" };
  if (!event.altKey && key === "k") return { type: "openConnections" };
  if (!event.altKey && key === "d") return { type: "splitBlock", direction: "horizontal" };
  if (event.altKey && key === "d") return { type: "splitBlock", direction: "vertical" };
  if (!event.altKey && key === "f") return { type: "searchTerminal" };
  if (!event.altKey && /^[1-9]$/.test(key)) return { type: "selectWorkspace", index: Number(key) - 1 };
  if (!event.altKey && (event.key === "[" || event.key === "]")) return { type: "cycleWorkspace", offset: event.key === "]" ? 1 : -1 };
  return null;
}

export function shortcutLabel(command: AppShortcutCommand["type"] | "splitVertical", platform: DesktopPlatform): string {
  if (platform === "macos") {
    if (command === "newWorkspace") return "⌘T";
    if (command === "openConnections") return "⌘K";
    if (command === "splitBlock") return "⌘D";
    if (command === "splitVertical") return "⇧⌘D";
    if (command === "searchTerminal") return "⌘F";
    if (command === "selectWorkspace") return "⌘1–9";
    if (command === "focusBlock") return "⌘⌥方向键";
    if (command === "cycleBlock") return "⌘⌥PageUp / PageDown";
    return "⇧⌘[ / ]";
  }
  if (command === "newWorkspace") return "Ctrl+Shift+T";
  if (command === "openConnections") return "Ctrl+Shift+K";
  if (command === "splitBlock") return "Ctrl+Shift+D";
  if (command === "splitVertical") return "Ctrl+Alt+Shift+D";
  if (command === "searchTerminal") return "Ctrl+Shift+F";
  if (command === "selectWorkspace") return "Ctrl+Shift+1–9";
  if (command === "focusBlock") return "Ctrl+Shift+方向键";
  if (command === "cycleBlock") return "Ctrl+Shift+PageUp / PageDown";
  return "Ctrl+Shift+[ / ]";
}
