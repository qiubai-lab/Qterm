import { describe, expect, it, vi } from "vitest";
import { cellColors, paintTerminalImage } from "./renderTerminalImage";
import { resolveCellColor, type TerminalImagePalette } from "./terminalImageTheme";
import { imageStyles, type TerminalImageCell, type TerminalImageSnapshot } from "./terminalImageModel";

const palette: TerminalImagePalette = { foreground: "#eeeeee", background: "#111111", header: "#222222", border: "#333333", muted: "#aaaaaa", colors: Array.from({ length: 16 }, (_, i) => `#${i.toString(16).repeat(6)}`) };
const cell: TerminalImageCell = { column: 0, chars: "A", width: 1, foreground: { mode: "default" }, background: { mode: "default" }, bold: false, italic: false, dim: false, inverse: false, invisible: false, underline: false, strikethrough: false, overline: false };
const snapshot: TerminalImageSnapshot = { width: 810, left: 7, cellWidth: 8, cellHeight: 16, fontFamily: "monospace", fontSize: 13, fontWeight: "normal", fontWeightBold: "bold", brightBold: true, columns: 100, lines: [[cell, { ...cell, chars: "中", width: 2, column: 1 }, { ...cell, chars: "secret", column: 3, invisible: true }], [{ ...cell, chars: "Z", column: 99 }]] };

function canvasFixture() {
  const context = Object.fromEntries(["scale", "save", "beginPath", "roundRect", "clip", "fillRect", "moveTo", "lineTo", "stroke", "arc", "fill", "fillText", "strokeRect", "restore"].map(name => [name, vi.fn()]));
  context.measureText = vi.fn(() => ({ actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }));
  const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  return { canvas, context };
}

describe("terminal image painting", () => {
  it("keeps full width and identical glyph coordinates across all three window styles", () => {
    for (const style of imageStyles) {
      const { canvas, context } = canvasFixture();
      paintTerminalImage(canvas, snapshot, style.id, palette);
      expect(canvas.width).toBe(1620);
      expect(canvas.height).toBe(188);
      expect(context.fillText).toHaveBeenCalledWith("A", 7, 61.5);
      expect(context.fillText).toHaveBeenCalledWith("中", 15, 61.5);
      expect(context.fillText).toHaveBeenCalledWith("Z", 799, 77.5);
      expect(context.fillText).not.toHaveBeenCalledWith("secret", expect.anything(), expect.anything());
    }
  });

  it("resolves themed ANSI colors, fixed RGB and the 256-color cube and grayscale", () => {
    expect(resolveCellColor({ mode: "palette", value: 1 }, "", palette, true)).toBe(palette.colors[9]);
    expect(resolveCellColor({ mode: "rgb", value: 0x010203 }, "", palette)).toBe("#010203");
    expect(resolveCellColor({ mode: "palette", value: 196 }, "", palette)).toBe("#ff0000");
    expect(resolveCellColor({ mode: "palette", value: 244 }, "", palette)).toBe("#808080");
    expect(cellColors({ ...cell, inverse: true }, snapshot, palette)).toEqual({ foreground: palette.background, background: palette.foreground });
  });
});
