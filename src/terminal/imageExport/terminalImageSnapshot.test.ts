import { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureTerminalImage } from "./terminalImageSnapshot";
import { imageDimensions, type TerminalImageGeometry } from "./terminalImageModel";

const geometry: TerminalImageGeometry = { width: 170, left: 7, cellWidth: 8, cellHeight: 16, fontFamily: "monospace", fontSize: 13, fontWeight: "normal", fontWeightBold: "bold", brightBold: true };
const terminals: Terminal[] = [];
afterEach(() => { terminals.splice(0).forEach(terminal => terminal.dispose()); vi.restoreAllMocks(); });

async function fixture(text: string, cols = 20, rows = 4) {
  const terminal = new Terminal({ cols, rows, allowProposedApi: true });
  terminals.push(terminal);
  await new Promise<void>(resolve => terminal.write(text, resolve));
  return terminal;
}
function select(terminal: Terminal, x: number, y: number, endX: number, endY: number) {
  vi.spyOn(terminal, "getSelectionPosition").mockReturnValue({ start: { x, y }, end: { x: endX, y: endY } });
}

describe("terminal image row snapshots", () => {
  it("exports complete rows outside the viewport, including blank lines and unselected columns", async () => {
    const terminal = await fixture("$ echo hello\r\nhello\r\n\r\nnext\r\nlast\r\nprompt");
    expect(terminal.buffer.active.baseY).toBeGreaterThan(0);
    select(terminal, 7, 0, 2, 3);
    const snapshot = captureTerminalImage(terminal, geometry);
    expect(snapshot.lines.map(line => line.map(cell => cell.chars).join(""))).toEqual(["$ echo hello", "hello", "", "next"]);
    expect(snapshot.lines.every(line => line.length === 20)).toBe(true);
    expect(snapshot.width).toBe(170);
  });

  it("excludes an exclusive end at the start of the next row", async () => {
    const terminal = await fixture("first\r\nsecond\r\nthird");
    select(terminal, 3, 0, 0, 2);
    expect(captureTerminalImage(terminal, geometry).lines).toHaveLength(2);
  });

  it("retains soft wrapping and freezes content before subsequent writes, resets or resizes", async () => {
    const terminal = await fixture("12345678901234567890wrapped");
    expect(terminal.buffer.active.getLine(1)?.isWrapped).toBe(true);
    select(terminal, 3, 0, 2, 1);
    const snapshot = captureTerminalImage(terminal, geometry);
    terminal.reset(); terminal.resize(10, 4);
    await new Promise<void>(resolve => terminal.write("replacement", resolve));
    expect(snapshot.columns).toBe(20);
    expect(snapshot.lines.map(line => line.map(cell => cell.chars).join(""))).toEqual(["12345678901234567890", "wrapped"]);
  });

  it("retains CJK width, combined characters, ANSI palette, RGB, invisible and inverse attributes", async () => {
    const terminal = await fixture("中文e\u0301\x1b[1;31mR\x1b[0;38;2;12;34;56;48;5;123mT\x1b[0;7mI\x1b[0;8mhidden\x1b[0m");
    select(terminal, 1, 0, 3, 0);
    const [line] = captureTerminalImage(terminal, geometry).lines;
    expect(line[0]).toMatchObject({ chars: "中", column: 0, width: 2 });
    expect(line[1]).toMatchObject({ chars: "文", column: 2, width: 2 });
    expect(line[2].chars).toBe("e\u0301");
    expect(line.find(cell => cell.chars === "R")).toMatchObject({ bold: true, foreground: { mode: "palette", value: 1 } });
    expect(line.find(cell => cell.chars === "T")).toMatchObject({ foreground: { mode: "rgb", value: 0x0c2238 }, background: { mode: "palette", value: 123 } });
    expect(line.find(cell => cell.chars === "I")?.inverse).toBe(true);
    expect(line.find(cell => cell.chars === "h")?.invisible).toBe(true);
  });

  it("reads the active alternate buffer and preserves colored empty cells", async () => {
    const terminal = await fixture("normal\x1b[?1049h\x1b[44m  \x1b[0malt");
    select(terminal, 2, 0, 4, 0);
    const [line] = captureTerminalImage(terminal, geometry).lines;
    expect(line.map(cell => cell.chars).join("")).not.toContain("normal");
    expect(line.filter(cell => cell.background.mode === "palette")).toHaveLength(2);
  });

  it("rejects missing or stale selections and oversized images without truncating", async () => {
    const terminal = await fixture("line");
    vi.spyOn(terminal, "getSelectionPosition").mockReturnValue(undefined);
    expect(() => captureTerminalImage(terminal, geometry)).toThrow("请先选择");
    select(terminal, 0, 0, 2, 99);
    expect(() => captureTerminalImage(terminal, geometry)).toThrow("选区已失效");
    expect(() => imageDimensions(1200, 16, 800)).toThrow("减少行数");
    expect(imageDimensions(170, 16, 4)).toMatchObject({ width: 170, pixelWidth: 340 });
  });
});
