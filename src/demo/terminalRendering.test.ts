import { expect, it, vi } from "vitest";
import { DemoTerminalSession } from "./terminalSession";

it("renders long commands and editing in a narrow terminal without duplicating prompts", async () => {
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const { Terminal } = await import("@xterm/xterm");
  const terminal = new Terminal({ cols: 32, rows: 20 });
  const session = new DemoTerminalSession({ host: "localhost", columns: 32, rows: 20, closed: () => undefined, output: data => terminal.write(data) });
  const write = (text: string) => session.write(new TextEncoder().encode(text));
  const flush = () => new Promise<void>(resolve => terminal.write("", resolve));
  const text = () => Array.from({ length: terminal.buffer.active.length }, (_, index) => terminal.buffer.active.getLine(index)?.translateToString(true) ?? "").join("\n");
  try {
    session.start();
    write("echo abcdefghijklmnopqrstuvwxyz0123456789");
    write("\x7f\x7f89\x1b[D\x1b[D\x7f7\x1b[F\r");
    await flush();
    expect(text().match(/demo@localhost/g)).toHaveLength(2);
    expect(text().replace(/\n/g, "")).toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    write("\x1b[A\r");
    await flush();
    expect(text().match(/demo@localhost/g)).toHaveLength(3);
    expect(text()).not.toContain("undefined");
  } finally { session.close(); terminal.dispose(); canvas.mockRestore(); }
});
