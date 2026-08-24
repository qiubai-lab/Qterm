import { describe, expect, it } from "vitest";

import { resolveAppShortcut, shortcutLabel } from "./shortcuts";

function key(keyValue: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { type: "keydown", key: keyValue, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers } as KeyboardEvent;
}

describe("application shortcuts", () => {
  it("uses Command on macOS and terminal-safe Ctrl+Shift chords elsewhere", () => {
    expect(resolveAppShortcut(key("d", { metaKey: true }), "macos")).toEqual({ type: "splitBlock", direction: "horizontal" });
    expect(resolveAppShortcut(key("d", { ctrlKey: true }), "windows")).toBeNull();
    expect(resolveAppShortcut(key("d", { ctrlKey: true, shiftKey: true }), "windows")).toEqual({ type: "splitBlock", direction: "horizontal" });
    expect(resolveAppShortcut(key("d", { ctrlKey: true, shiftKey: true, altKey: true }), "linux")).toEqual({ type: "splitBlock", direction: "vertical" });
  });

  it("requires exact modifiers so terminal and OS combinations pass through", () => {
    expect(resolveAppShortcut(key("c", { ctrlKey: true }), "windows")).toBeNull();
    expect(resolveAppShortcut(key("k", { ctrlKey: true }), "linux")).toBeNull();
    expect(resolveAppShortcut(key("t", { metaKey: true, altKey: true }), "macos")).toBeNull();
    expect(resolveAppShortcut({ ...key("f", { metaKey: true }), type: "keyup" }, "macos")).toBeNull();
  });

  it("resolves search and workspace selection with platform labels", () => {
    expect(resolveAppShortcut(key("f", { ctrlKey: true, shiftKey: true }), "windows")).toEqual({ type: "searchTerminal" });
    expect(resolveAppShortcut(key("3", { metaKey: true }), "macos")).toEqual({ type: "selectWorkspace", index: 2 });
    expect(shortcutLabel("searchTerminal", "macos")).toBe("⌘F");
    expect(shortcutLabel("newWorkspace", "windows")).toBe("Ctrl+Shift+T");
  });

  it("moves between blocks without consuming plain terminal arrow keys", () => {
    expect(resolveAppShortcut(key("ArrowLeft", { ctrlKey: true }), "windows")).toBeNull();
    expect(resolveAppShortcut(key("ArrowLeft", { ctrlKey: true, shiftKey: true }), "windows")).toEqual({ type: "focusBlock", direction: "left" });
    expect(resolveAppShortcut(key("ArrowDown", { metaKey: true, altKey: true }), "macos")).toEqual({ type: "focusBlock", direction: "down" });
    expect(resolveAppShortcut(key("PageDown", { ctrlKey: true, shiftKey: true }), "linux")).toEqual({ type: "cycleBlock", offset: 1 });
  });
});
