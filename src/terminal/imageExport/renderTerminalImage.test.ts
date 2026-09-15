import { describe, expect, it, vi } from "vitest";
import { cellColors, paintTerminalImage } from "./renderTerminalImage";
import { resolveCellColor, type TerminalImagePalette } from "./terminalImageTheme";
import { imageStyles, type TerminalImageCell, type TerminalImageSnapshot } from "./terminalImageModel";

vi.mock("./terminalImageCorners", () => ({ applyTerminalImageCorners: vi.fn() }));
import { applyTerminalImageCorners } from "./terminalImageCorners";

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
      expect(canvas.height).toBe(196);
      expect(context.fillText).toHaveBeenCalledWith("A", 7, 61.5);
      expect(context.fillText).toHaveBeenCalledWith("中", 15, 61.5);
      expect(context.fillText).toHaveBeenCalledWith("Z", 799, 77.5);
      expect(context.fillText).not.toHaveBeenCalledWith("secret", expect.anything(), expect.anything());
    }
  });

  it("aligns fractional dimensions to the output pixels and masks all styles with one matching contour", () => {
    for (const style of imageStyles) {
      const { canvas, context } = canvasFixture();
      paintTerminalImage(canvas, { ...snapshot, width: 810.2 }, style.id, palette);
      expect(canvas.width).toBe(1621);
      expect(context.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 810.5, 98);
      expect(context.roundRect).toHaveBeenCalledWith(0.5, 0.5, 809.5, 97, 7.5);
      expect(applyTerminalImageCorners).toHaveBeenLastCalledWith(context, 810.5, 98, 2);
      expect(context.clip).not.toHaveBeenCalled();
      expect(context.fillText).toHaveBeenCalledWith("Z", 799, 77.5);
    }
  });

  it("renders each resolution directly while keeping logical glyph geometry unchanged", () => {
    for (const scale of [1, 2, 3] as const) {
      const { canvas, context } = canvasFixture();
      paintTerminalImage(canvas, snapshot, "macos", palette, scale);
      expect([canvas.width, canvas.height]).toEqual([810 * scale, 98 * scale]);
      expect(context.scale).toHaveBeenCalledWith(scale, scale);
      expect(context.fillText).toHaveBeenCalledWith("中", 15, 61.5);
      expect(applyTerminalImageCorners).toHaveBeenLastCalledWith(context, 810, 98, scale);
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
