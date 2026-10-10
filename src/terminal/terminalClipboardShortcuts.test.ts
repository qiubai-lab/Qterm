import { describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { handleClipboardShortcut, type ClipboardPlatform } from "./terminalClipboardShortcuts";

const shortcuts: [ClipboardPlatform, KeyboardEventInit][] = [
  ["windows", { ctrlKey: true }],
  ["windows", { ctrlKey: true, shiftKey: true }],
  ["linux", { ctrlKey: true, shiftKey: true }],
  ["mac", { metaKey: true }],
];

describe("terminal clipboard shortcut ownership", () => {
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
