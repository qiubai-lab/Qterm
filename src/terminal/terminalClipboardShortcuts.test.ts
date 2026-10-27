import { describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { handleClipboardShortcut, type ClipboardPlatform } from "./terminalClipboardShortcuts";

const shortcuts: [ClipboardPlatform, KeyboardEventInit][] = [
  ["windows", { ctrlKey: true }],
  ["windows", { ctrlKey: true, shiftKey: true }],
  ["linux", { ctrlKey: true, shiftKey: true }],
  ["mac", { metaKey: true }],
  ["mac", { metaKey: true, shiftKey: true }],
];

describe("terminal clipboard shortcut ownership", () => {
  it.each(["windows", "mac", "linux"] as const)("leaves terminal controls and unrelated app commands alone on %s", (platform) => {
    const terminal = { hasSelection: () => false } as Terminal;
    const paste = vi.fn();
    const copy = vi.fn();
    for (const key of ["a", "c", "z", "w", "f", "1"]) {
      const event = new KeyboardEvent("keydown", { key, ctrlKey: true, cancelable: true });
      expect(handleClipboardShortcut(event, platform, terminal, true, copy, paste)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
    }
    for (const modifiers of [{ ctrlKey: true, altKey: true }, { metaKey: true, ctrlKey: true }, { metaKey: true, altKey: true }]) {
      expect(handleClipboardShortcut(new KeyboardEvent("keydown", { key: "v", ...modifiers }), platform, terminal, true, copy, paste)).toBe(true);
    }
    expect(paste).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });
  it.each(shortcuts)("passes %s copy to the TUI when xterm has no selection (%j)", (platform, modifiers) => {
    const terminal = { hasSelection: () => false } as Terminal;
    const copy = vi.fn();
    const event = new KeyboardEvent("keydown", { key: "c", ...modifiers, cancelable: true });
    expect(handleClipboardShortcut(event, platform, terminal, true, copy, vi.fn())).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(copy).not.toHaveBeenCalled();
  });

  it.each(shortcuts)("copies the native selection on %s (%j)", (platform, modifiers) => {
    const terminal = { hasSelection: () => true } as Terminal;
    const copy = vi.fn().mockResolvedValue(undefined);
    const event = new KeyboardEvent("keydown", { key: "c", ...modifiers, cancelable: true });
    expect(handleClipboardShortcut(event, platform, terminal, true, copy, vi.fn())).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(copy).toHaveBeenCalledOnce();
  });

  it.each(shortcuts)("preserves paste without selection on %s (%j)", (platform, modifiers) => {
    const terminal = { hasSelection: () => false } as Terminal;
    const paste = vi.fn().mockResolvedValue(undefined);
    const event = new KeyboardEvent("keydown", { key: "v", ...modifiers, cancelable: true });
    expect(handleClipboardShortcut(event, platform, terminal, true, vi.fn(), paste)).toBe(false);
    expect(paste).toHaveBeenCalledOnce();
    expect(handleClipboardShortcut(event, platform, terminal, false, vi.fn(), paste)).toBe(true);
    expect(paste).toHaveBeenCalledOnce();
  });
});
