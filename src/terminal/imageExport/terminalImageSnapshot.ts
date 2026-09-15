import type { IBufferCell, Terminal } from "@xterm/xterm";
import { imageDimensions, type CellColor, type TerminalImageGeometry, type TerminalImageSnapshot } from "./terminalImageModel";

export function measureTerminalImage(terminal: Terminal, surface: HTMLElement): TerminalImageGeometry {
  const bounds = surface.getBoundingClientRect();
  const screen = terminal.element?.querySelector(".xterm-screen")?.getBoundingClientRect();
  if (!screen || !screen.width || !screen.height || !bounds.width) throw new Error("终端尚未就绪，请稍后重试");
  if (screen.width > bounds.width || screen.left < bounds.left) throw new Error("终端布局正在更新，请稍后重试");
  return {
    width: bounds.width,
    left: screen.left - bounds.left,
    cellWidth: screen.width / terminal.cols,
    cellHeight: screen.height / terminal.rows,
    fontFamily: terminal.options.fontFamily ?? "monospace",
    fontSize: terminal.options.fontSize ?? 13,
    fontWeight: terminal.options.fontWeight ?? "normal",
    fontWeightBold: terminal.options.fontWeightBold ?? "bold",
    brightBold: terminal.options.drawBoldTextInBrightColors !== false,
  };
}

export function captureTerminalImage(terminal: Terminal, geometry: TerminalImageGeometry): TerminalImageSnapshot {
  const range = terminal.getSelectionPosition();
  if (!range) throw new Error("请先选择需要导出的终端行");
  // xterm 6 returns zero-based positions, despite the IBufferCellPosition comment.
  // The selection's end is exclusive; stopping at column zero adds no new row.
  const first = range.start.y;
  const last = range.end.y - (range.end.x === 0 ? 1 : 0);
  const buffer = terminal.buffer.active;
  if (first < 0 || last < first || last >= buffer.length) throw new Error("选区已失效，请重新选择终端行");
  const rows = last - first + 1;
  imageDimensions(geometry.width, geometry.cellHeight, rows);
  if (rows * terminal.cols > 500_000) throw new Error("选中内容过长，请减少行数后重新导出");
  const lines = [];
  const reusable = buffer.getNullCell();
  for (let row = first; row <= last; row++) {
    const line = buffer.getLine(row);
    if (!line) throw new Error("选区已失效，请重新选择终端行");
    const cells = [];
    for (let column = 0; column < terminal.cols; column++) {
      const cell = line.getCell(column, reusable);
      if (!cell || cell.getWidth() === 0) continue;
      cells.push({
        column, chars: cell.getChars(), width: cell.getWidth(),
        foreground: cellColor(cell, true), background: cellColor(cell, false),
        bold: !!cell.isBold(), italic: !!cell.isItalic(), dim: !!cell.isDim(),
        inverse: !!cell.isInverse(), invisible: !!cell.isInvisible(),
        underline: !!cell.isUnderline(), strikethrough: !!cell.isStrikethrough(), overline: !!cell.isOverline(),
      });
    }
    lines.push(cells);
  }
  return { ...geometry, columns: terminal.cols, lines };
}

function cellColor(cell: IBufferCell, foreground: boolean): CellColor {
  const rgb = foreground ? cell.isFgRGB() : cell.isBgRGB();
  const palette = foreground ? cell.isFgPalette() : cell.isBgPalette();
  const value = foreground ? cell.getFgColor() : cell.getBgColor();
  return rgb ? { mode: "rgb", value } : palette ? { mode: "palette", value } : { mode: "default" };
}
