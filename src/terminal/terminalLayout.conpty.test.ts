// @vitest-environment node
import { Terminal } from "@xterm/xterm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTerminalLayout } from "./terminalLayout";

// Structure captured from portable-pty / ConPTY: repaint all viewport rows,
// then restore the cursor. A delayed 24-row repaint in a 6-row grid scrolls.
function repaint(rows: number) {
  const content = ["Microsoft Windows [ConPTY regression]", "copyright", "", "C:\\probe>"];
  return "\x1b[?25l\x1b[H" + Array.from({ length: rows }, (_, row) => (content[row] ?? "") + "\x1b[K").join("\r\n") + "\x1b[4;10H\x1b[?25h";
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("does not turn delayed ConPTY screen repaints into repeated scrollback while dragging", async () => {
  const terminal = new Terminal({ cols: 80, rows: 24, scrollback: 8000, allowProposedApi: true, windowsPty: { backend: "conpty", buildNumber: 26100 } });
  let dimensions = { cols: 80, rows: 24 };
  const write = async (data: string) => {
    const done = new Promise<void>(resolve => terminal.write(data, resolve));
    await vi.runAllTimersAsync();
    await done;
  };
  const layout = createTerminalLayout(terminal, {
    proposeDimensions: () => dimensions,
    fit: () => terminal.resize(dimensions.cols, dimensions.rows),
  }, async (_cols, rows) => { setTimeout(() => terminal.write(repaint(rows)), 60); });
  const count = () => Array.from({ length: terminal.buffer.active.length }, (_, row) => terminal.buffer.active.getLine(row)?.translateToString(true)).filter(line => line?.includes("Microsoft Windows")).length;
  try {
    await write(repaint(24));
    for (let cycle = 0; cycle < 8; cycle++) {
      for (const rows of [18, 10, 6, 8, 16, 24]) {
        dimensions = { cols: 80, rows };
        layout.restore();
        // A repaint already in transit from the old size.
        setTimeout(() => terminal.write(repaint(24)), 60);
        await vi.advanceTimersByTimeAsync(16);
      }
    }
    await vi.runAllTimersAsync();
    expect(count()).toBe(1);
    dimensions = { cols: 80, rows: 18 };
    layout.restore();
    await vi.runAllTimersAsync();
    expect(terminal.rows).toBe(18);
    expect(count()).toBe(1);
  } finally { layout.dispose(); terminal.dispose(); }
});
