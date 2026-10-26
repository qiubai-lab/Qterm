import { describe, expect, it } from "vitest";

import { resolveAppShortcut, shortcutLabel } from "./shortcuts";

function key(keyValue: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { type: "keydown", key: keyValue, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers } as KeyboardEvent;
}

describe("application shortcuts", () => {
  it("resolves search and numbered workspace selection across platforms", () => {
    expect(resolveAppShortcut(key("f", { metaKey: true }), "macos")).toEqual({ type: "searchTerminal" });
    expect(resolveAppShortcut(key("3", { metaKey: true }), "macos")).toEqual({ type: "selectWorkspace", index: 2 });
    expect(resolveAppShortcut(key("f", { ctrlKey: true, shiftKey: true }), "windows")).toEqual({ type: "searchTerminal" });
    expect(resolveAppShortcut(key("9", { ctrlKey: true, shiftKey: true }), "linux")).toEqual({ type: "selectWorkspace", index: 8 });
    expect(shortcutLabel("searchTerminal", "macos")).toBe("⌘F");
    expect(shortcutLabel("selectWorkspace", "windows")).toBe("Ctrl+Shift+1–9");
  });

  it.each(["macos", "windows", "linux"] as const)("resolves only plain Ctrl+W for terminal close on %s", (platform) => {
    expect(resolveAppShortcut(key("w", { ctrlKey: true }), platform)).toEqual({ type: "closeBlock" });
    expect(resolveAppShortcut(key("W", { ctrlKey: true }), platform)).toEqual({ type: "closeBlock" });
    for (const modifiers of [{ shiftKey: true }, { altKey: true }, { metaKey: true }]) {
      expect(resolveAppShortcut(key("w", { ctrlKey: true, ...modifiers }), platform)).toBeNull();
    }
    expect(resolveAppShortcut({ ...key("w", { ctrlKey: true }), type: "keyup" }, platform)).toBeNull();
    expect(shortcutLabel("closeBlock", platform)).toBe(platform === "macos" ? "⌘W" : "Ctrl+W");
  });

  it("resolves Cmd+W only on macOS with exact modifiers", () => {
    expect(resolveAppShortcut(key("w", { metaKey: true }), "macos")).toEqual({ type: "closeBlock" });
    for (const platform of ["windows", "linux"] as const) expect(resolveAppShortcut(key("w", { metaKey: true }), platform)).toBeNull();
    for (const modifiers of [{ shiftKey: true }, { altKey: true }, { ctrlKey: true }]) {
      expect(resolveAppShortcut(key("w", { metaKey: true, ...modifiers }), "macos")).toBeNull();
    }
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
