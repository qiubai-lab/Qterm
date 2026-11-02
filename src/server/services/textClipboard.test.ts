import { afterEach, expect, it, vi } from "vitest";
import { readText, writeText } from "./textClipboard";
import { prepareLocalTerminalClipboardPaste } from "./localSessions";

afterEach(() => vi.unstubAllGlobals());

it("explains browser clipboard restrictions on HTTP without throwing a TypeError", async () => {
  vi.stubGlobal("navigator", { clipboard: undefined });
  await expect(readText()).rejects.toThrow("Ctrl+V");
  await expect(prepareLocalTerminalClipboardPaste()).rejects.toThrow("Ctrl+V");
  await expect(writeText("example")).rejects.toThrow("剪贴板写入");
});
