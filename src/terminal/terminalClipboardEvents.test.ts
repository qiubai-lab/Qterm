import { afterEach, describe, expect, it, vi } from "vitest";
import { bindTerminalClipboardEvents } from "./terminalClipboardShortcuts";

afterEach(() => document.body.replaceChildren());

function fixture(enabled = true) {
  const element = document.createElement("div");
  const textarea = document.createElement("textarea");
  const search = document.createElement("input");
  element.append(textarea);
  document.body.append(element, search);
  const paste = vi.fn().mockResolvedValue(undefined);
  const selectAll = vi.fn();
  const xtermPaste = vi.fn();
  // xterm registers on both elements before Qterm binds its capture listener.
  textarea.addEventListener("paste", xtermPaste);
  element.addEventListener("paste", xtermPaste);
  const unbind = bindTerminalClipboardEvents(element, enabled, paste, selectAll);
  return { element, textarea, search, paste, selectAll, xtermPaste, unbind };
}

describe("native terminal editing events", () => {
  it.each(["textarea", "element"] as const)("routes native paste from %s once before xterm can consume text", (target) => {
    const f = fixture();
    const event = new Event("paste", { bubbles: true, cancelable: true });
    expect(f[target].dispatchEvent(event)).toBe(false);
    expect(f.paste).toHaveBeenCalledOnce();
    expect(f.xtermPaste).not.toHaveBeenCalled();
    f.unbind();
  });

  it("blocks native paste into a disconnected terminal", () => {
    const f = fixture(false);
    expect(f.textarea.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true }))).toBe(false);
    expect(f.paste).not.toHaveBeenCalled();
    expect(f.xtermPaste).not.toHaveBeenCalled();
    f.unbind();
  });

  it("leaves search inputs, other blocks and copy/cut/undo to their own handlers", () => {
    const f = fixture();
    for (const type of ["paste", "qterm-terminal-select-all"]) {
      expect(f.search.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))).toBe(true);
    }
    for (const type of ["copy", "cut", "beforeinput"]) {
      expect(f.textarea.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))).toBe(true);
    }
    expect(f.paste).not.toHaveBeenCalled();
    expect(f.selectAll).not.toHaveBeenCalled();
    f.unbind();
  });

  it("acknowledges native select-all even when terminal input is disabled", () => {
    const f = fixture(false);
    expect(f.textarea.dispatchEvent(new CustomEvent("qterm-terminal-select-all", { bubbles: true, cancelable: true }))).toBe(false);
    expect(f.selectAll).toHaveBeenCalledOnce();
    f.unbind();
  });

  it("removes old callbacks before a retained view is rebound", () => {
    const f = fixture();
    f.unbind();
    expect(f.textarea.dispatchEvent(new Event("qterm-terminal-select-all", { bubbles: true, cancelable: true }))).toBe(true);
    const paste = vi.fn().mockResolvedValue(undefined);
    const unbind = bindTerminalClipboardEvents(f.element, true, paste, vi.fn());
    f.textarea.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true }));
    expect(paste).toHaveBeenCalledOnce();
    expect(f.paste).not.toHaveBeenCalled();
    expect(f.selectAll).not.toHaveBeenCalled();
    unbind();
  });
});
