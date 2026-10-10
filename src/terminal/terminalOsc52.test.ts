import { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminalOsc52Addon, MAX_OSC52_BYTES } from "./terminalOsc52";

const terminals: Terminal[] = [];
afterEach(() => { terminals.splice(0).forEach((terminal) => terminal.dispose()); });

function setup(writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)) {
  const terminal = new Terminal({ allowProposedApi: true });
  terminals.push(terminal);
  const addon = createTerminalOsc52Addon(writeText);
  terminal.loadAddon(addon);
  const input = vi.fn();
  terminal.onData(input);
  const write = (data: string) => new Promise<void>((resolve) => terminal.write(data, resolve));
  return { terminal, addon, writeText, input, write };
}

function base64(text: string) {
  return btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));
}

describe("terminal OSC 52 clipboard writes", () => {
  it("copies UTF-8 across output chunks with BEL and ST terminators without rendering control data", async () => {
    const { terminal, write, writeText } = setup();
    const text = "你好 👋\nsecond line";
    const encoded = base64(text);
    await write(`before\x1b]52;c;${encoded.slice(0, 5)}`);
    expect(writeText).not.toHaveBeenCalled();
    await write(`${encoded.slice(5)}\x07after`);
    expect(writeText).toHaveBeenLastCalledWith(text);
    await write(`\x1b]52;;${base64("\uFEFFpreserve BOM")}\x1b\\`);
    expect(writeText).toHaveBeenLastCalledWith("\uFEFFpreserve BOM");
    expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe("beforeafter");
  });

  it.each(["c;?", ";?", "p;YQ==", "s;YQ==", "cp;YQ==", "0;YQ==", "missing-separator", "c;%%%", "c;YQ=", "c;YR==", "c;Y Q==", "c;/w=="])(
    "ignores unsupported or invalid requests (%s) without responding to the process", async (data) => {
      const { write, writeText, input } = setup();
      await write(`\x1b]52;${data}\x07`);
      expect(writeText).not.toHaveBeenCalled();
      expect(input).not.toHaveBeenCalled();
    },
  );

  it("supports an explicit empty clipboard write", async () => {
    const { write, writeText } = setup();
    await write("\x1b]52;c;\x07");
    expect(writeText).toHaveBeenCalledWith("");
  });

  it("accepts the byte limit and rejects larger decoded and encoded payloads", async () => {
    const { write, writeText } = setup();
    const text = "a".repeat(MAX_OSC52_BYTES);
    await write(`\x1b]52;c;${btoa(text)}\x07`);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text);
    await write(`\x1b]52;c;${btoa(text + "a")}\x07`);
    await write(`\x1b]52;c;${btoa(text + "aaaa")}\x07`);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("serializes native writes and continues parsing after a rejected write", async () => {
    let rejectFirst!: (error: Error) => void;
    const writeText = vi.fn<(text: string) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValue(undefined);
    const { terminal, write } = setup(writeText);
    const finished = write(`\x1b]52;c;${base64("first")}\x07\x1b]52;c;${base64("second")}\x07ready`);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith("first"));
    rejectFirst(new Error("clipboard unavailable"));
    await finished;
    expect(writeText.mock.calls).toEqual([["first"], ["second"]]);
    expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe("ready");
  });

  it("removes the protocol handler when the addon is disposed", async () => {
    const { addon, write, writeText } = setup();
    addon.dispose();
    await write(`\x1b]52;c;${base64("ignored")}\x07`);
    expect(writeText).not.toHaveBeenCalled();
  });
});
