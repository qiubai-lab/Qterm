import { afterEach, expect, it, vi } from "vitest";
import { readText, writeText } from "./browserClipboard";

const originalExecCommand = document.execCommand;
afterEach(() => { Object.defineProperty(document, "execCommand", { configurable: true, value: originalExecCommand }); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren(); });

it("copies exact text on HTTP synchronously and restores input focus and selection", async () => {
  vi.stubGlobal("navigator", { clipboard: undefined });
  const input = document.createElement("textarea");
  input.value = "original"; document.body.append(input); input.focus(); input.setSelectionRange(1, 4);
  const exec = vi.fn(() => {
    const field = document.activeElement as HTMLTextAreaElement;
    expect(field.value).toBe("中文\n  text\t");
    expect(field.selectionEnd).toBe(field.value.length);
    return true;
  });
  Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
  const pending = writeText("中文\n  text\t");
  expect(exec).toHaveBeenCalledWith("copy");
  await pending;
  expect(document.activeElement).toBe(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
  expect(document.querySelectorAll("textarea")).toHaveLength(1);
});

it("uses async clipboard when allowed and falls back after permission rejection", async () => {
  const write = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
  vi.stubGlobal("navigator", { clipboard: { writeText: write } });
  const exec = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
  await writeText("first"); expect(exec).not.toHaveBeenCalled();
  await writeText("second"); expect(exec).toHaveBeenCalledOnce();
});

it.each([false, "throw"])("reports legacy failure (%s) and removes transient clipboard text", async result => {
  vi.stubGlobal("navigator", { clipboard: undefined });
  Object.defineProperty(document, "execCommand", { configurable: true, value: () => {
    if (result === "throw") throw new Error("blocked");
    return result;
  } });
  await expect(writeText("private text")).rejects.toThrow("手动");
  expect(document.querySelector("textarea")).toBeNull();
});

it("gives platform-aware native paste guidance for missing and denied APIs", async () => {
  vi.stubGlobal("navigator", { platform: "MacIntel" });
  await expect(readText()).rejects.toThrow("⌘V");
  vi.stubGlobal("navigator", { platform: "Win32", clipboard: { readText: vi.fn().mockRejectedValue(new Error("denied")) } });
  await expect(readText()).rejects.toThrow("Ctrl+V");
});
