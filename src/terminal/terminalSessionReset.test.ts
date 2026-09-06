import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";

import { resetTerminalSession } from "./terminalSessionReset";

function write(terminal: Terminal, data: string) {
  return new Promise<void>((resolve) => terminal.write(data, resolve));
}

describe("terminal session reset", () => {
  it("discards queued output before rendering a short new session without scrollback", async () => {
    const terminal = new Terminal({ cols: 20, rows: 4 });

    terminal.write("old1\r\nold2\r\nold3\r\nold4\r\nold5");
    resetTerminalSession(terminal);
    await write(terminal, "new");

    expect(terminal.buffer.active.baseY).toBe(0);
    expect(terminal.buffer.active.viewportY).toBe(0);
    expect(terminal.buffer.active.length).toBe(terminal.rows);
    expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe("new");
    terminal.dispose();
  });
});
