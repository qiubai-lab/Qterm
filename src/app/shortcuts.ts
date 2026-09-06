import type { DesktopPlatform } from "../lib/tauri/window";

export type AppShortcutCommand =
  | { type: "selectWorkspace"; index: number }
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
    if (event.altKey || event.shiftKey) return null;
    if (key === "f") return { type: "searchTerminal" };
    if (/^[1-9]$/.test(key)) return { type: "selectWorkspace", index: Number(key) - 1 };
    return null;
  }

  if (!event.shiftKey || event.altKey) return null;
  if (key === "f") return { type: "searchTerminal" };
  if (/^[1-9]$/.test(key)) return { type: "selectWorkspace", index: Number(key) - 1 };
  return null;
}

export function shortcutLabel(command: AppShortcutCommand["type"], platform: DesktopPlatform): string {
  if (platform === "macos") {
    if (command === "searchTerminal") return "⌘F";
    return "⌘1–9";
  }
  if (command === "searchTerminal") return "Ctrl+Shift+F";
  return "Ctrl+Shift+1–9";
}
