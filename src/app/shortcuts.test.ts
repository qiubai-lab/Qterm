import { describe, expect, it } from "vitest";

import { resolveAppShortcut, shortcutLabel } from "./shortcuts";

function key(keyValue: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { type: "keydown", key: keyValue, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers } as KeyboardEvent;
}

describe("application shortcuts", () => {
  it("resolves only search and numbered workspace selection across platforms", () => {
    expect(resolveAppShortcut(key("f", { metaKey: true }), "macos")).toEqual({ type: "searchTerminal" });
    expect(resolveAppShortcut(key("3", { metaKey: true }), "macos")).toEqual({ type: "selectWorkspace", index: 2 });
    expect(resolveAppShortcut(key("f", { ctrlKey: true, shiftKey: true }), "windows")).toEqual({ type: "searchTerminal" });
    expect(resolveAppShortcut(key("9", { ctrlKey: true, shiftKey: true }), "linux")).toEqual({ type: "selectWorkspace", index: 8 });
    expect(shortcutLabel("searchTerminal", "macos")).toBe("⌘F");
    expect(shortcutLabel("selectWorkspace", "windows")).toBe("Ctrl+Shift+1–9");
  });

  it("requires exact modifiers so terminal and OS combinations pass through", () => {
    expect(resolveAppShortcut(key("c", { ctrlKey: true }), "windows")).toBeNull();
    expect(resolveAppShortcut(key("k", { ctrlKey: true }), "linux")).toBeNull();
    expect(resolveAppShortcut(key("t", { metaKey: true, altKey: true }), "macos")).toBeNull();
    expect(resolveAppShortcut({ ...key("f", { metaKey: true }), type: "keyup" }, "macos")).toBeNull();
  });

  it("does not resolve removed workspace and block commands", () => {
    expect(resolveAppShortcut(key("t", { metaKey: true }), "macos")).toBeNull();
    expect(resolveAppShortcut(key("k", { ctrlKey: true, shiftKey: true }), "windows")).toBeNull();
    expect(resolveAppShortcut(key("d", { ctrlKey: true, shiftKey: true }), "windows")).toBeNull();
    expect(resolveAppShortcut(key("d", { ctrlKey: true, shiftKey: true, altKey: true }), "linux")).toBeNull();
    expect(resolveAppShortcut(key("]", { metaKey: true, shiftKey: true }), "macos")).toBeNull();
    expect(resolveAppShortcut(key("ArrowLeft", { ctrlKey: true }), "windows")).toBeNull();
    expect(resolveAppShortcut(key("ArrowLeft", { ctrlKey: true, shiftKey: true }), "windows")).toBeNull();
    expect(resolveAppShortcut(key("PageDown", { ctrlKey: true, shiftKey: true }), "linux")).toBeNull();
  });
});
