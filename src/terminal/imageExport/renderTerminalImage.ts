import type { AppTheme } from "../../lib/tauri/settings";
import { drawImageChrome } from "./terminalImageChrome";
import { IMAGE_HEADER_HEIGHT, IMAGE_SCALE, IMAGE_VERTICAL_PADDING, imageDimensions, type TerminalImageCell, type TerminalImageSnapshot, type TerminalImageStyle } from "./terminalImageModel";
import { readImagePalette, resolveCellColor, type TerminalImagePalette } from "./terminalImageTheme";

export interface RenderedTerminalImage {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  dispose: () => void;
}

export async function renderTerminalImage(snapshot: TerminalImageSnapshot, style: TerminalImageStyle, theme: AppTheme): Promise<RenderedTerminalImage> {
  if (document.fonts) {
    await Promise.all([document.fonts.load(`${snapshot.fontSize}px ${snapshot.fontFamily}`), document.fonts.load(`${snapshot.fontWeightBold} ${snapshot.fontSize}px ${snapshot.fontFamily}`)]);
    await document.fonts.ready;
  }
  const canvas = document.createElement("canvas");
  try {
    paintTerminalImage(canvas, snapshot, style, readImagePalette(theme));
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("图片生成失败，请重试")), "image/png"));
    const url = URL.createObjectURL(blob);
    return { blob, url, width: canvas.width, height: canvas.height, dispose: () => URL.revokeObjectURL(url) };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function paintTerminalImage(canvas: HTMLCanvasElement, snapshot: TerminalImageSnapshot, style: TerminalImageStyle, palette: TerminalImagePalette) {
  const dimensions = imageDimensions(snapshot.width, snapshot.cellHeight, snapshot.lines.length);
  canvas.width = dimensions.pixelWidth;
  canvas.height = dimensions.pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法生成终端图片");
  context.scale(IMAGE_SCALE, IMAGE_SCALE);
  context.save();
  context.beginPath();
  context.roundRect(0, 0, snapshot.width, dimensions.height, style === "windows" ? 6 : 9);
  context.clip();
  context.fillStyle = palette.background;
  context.fillRect(0, 0, snapshot.width, dimensions.height);
  drawImageChrome(context, snapshot.width, style, palette);
  const top = IMAGE_HEADER_HEIGHT + IMAGE_VERTICAL_PADDING;
  context.font = `${snapshot.fontWeight} ${snapshot.fontSize}px ${snapshot.fontFamily}`;
  const metrics = context.measureText("Mg");
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? snapshot.fontSize;
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? 0;
  const baseline = (snapshot.cellHeight - ascent - descent) / 2 + ascent;
  context.textBaseline = "alphabetic";
  // Paint all backgrounds first so a following cell does not erase a glyph overhang.
  snapshot.lines.forEach((line, row) => line.forEach(cell => {
    const colors = cellColors(cell, snapshot, palette);
    context.fillStyle = colors.background;
    context.fillRect(snapshot.left + cell.column * snapshot.cellWidth, top + row * snapshot.cellHeight, cell.width * snapshot.cellWidth, snapshot.cellHeight);
  }));
  snapshot.lines.forEach((line, row) => line.forEach(cell => {
    if (cell.invisible) return;
    const x = snapshot.left + cell.column * snapshot.cellWidth;
    const y = top + row * snapshot.cellHeight;
    const width = cell.width * snapshot.cellWidth;
    const foreground = cellColors(cell, snapshot, palette).foreground;
    context.fillStyle = foreground;
    context.strokeStyle = foreground;
    context.globalAlpha = cell.dim ? 0.5 : 1;
    context.font = `${cell.italic ? "italic " : ""}${cell.bold ? snapshot.fontWeightBold : snapshot.fontWeight} ${snapshot.fontSize}px ${snapshot.fontFamily}`;
    if (cell.chars) context.fillText(cell.chars, x, y + baseline);
    context.lineWidth = Math.max(1, snapshot.fontSize / 14);
    if (cell.underline) strokeLine(context, x, y + Math.min(snapshot.cellHeight - 1, baseline + 1.5), width);
    if (cell.strikethrough) strokeLine(context, x, y + baseline - ascent * 0.35, width);
    if (cell.overline) strokeLine(context, x, y + 1, width);
  }));
  context.globalAlpha = 1;
  context.restore();
  context.strokeStyle = palette.border;
  context.lineWidth = 1;
  context.beginPath(); context.roundRect(0.5, 0.5, snapshot.width - 1, dimensions.height - 1, style === "windows" ? 6 : 9); context.stroke();
}

export function cellColors(cell: TerminalImageCell, snapshot: Pick<TerminalImageSnapshot, "brightBold">, palette: TerminalImagePalette) {
  const foreground = resolveCellColor(cell.foreground, palette.foreground, palette, snapshot.brightBold && cell.bold);
  const background = resolveCellColor(cell.background, palette.background, palette);
  return cell.inverse ? { foreground: background, background: foreground } : { foreground, background };
}

function strokeLine(context: CanvasRenderingContext2D, x: number, y: number, width: number) {
  context.beginPath(); context.moveTo(x, y); context.lineTo(x + width, y); context.stroke();
}
