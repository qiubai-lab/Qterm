import type { AppTheme } from "../../lib/tauri/settings";
import type { DesktopPlatform } from "../../lib/tauri/window";

export type TerminalImageStyle = DesktopPlatform;
export const imageStyles = [{ id: "macos", label: "MacOS" }, { id: "linux", label: "Linux" }, { id: "windows", label: "Windows" }] as const;
export const imageThemes: ReadonlyArray<{ id: AppTheme; label: string }> = [{ id: "dark", label: "深色" }, { id: "light", label: "浅色" }, { id: "cyberpunk", label: "赛博朋克" }];
export const IMAGE_SCALE = 2;
export const IMAGE_HEADER_HEIGHT = 38;
export const IMAGE_VERTICAL_PADDING = 12;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_DIMENSION = 16_384;
export const IMAGE_FEEDBACK_SUCCESS_MS = 2400;
export const IMAGE_FEEDBACK_ERROR_MS = 5000;

export interface TerminalImageFeedback {
  id: number;
  action: "copy" | "save";
  message: string;
  error: boolean;
}

export type CellColor = { mode: "default" } | { mode: "palette" | "rgb"; value: number };
export interface TerminalImageCell {
  column: number;
  chars: string;
  width: number;
  foreground: CellColor;
  background: CellColor;
  bold: boolean;
  italic: boolean;
  dim: boolean;
  inverse: boolean;
  invisible: boolean;
  underline: boolean;
  strikethrough: boolean;
  overline: boolean;
}

export interface TerminalImageGeometry {
  width: number;
  left: number;
  cellWidth: number;
  cellHeight: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  fontWeightBold: string | number;
  brightBold: boolean;
}

export interface TerminalImageSnapshot extends TerminalImageGeometry {
  columns: number;
  lines: ReadonlyArray<ReadonlyArray<TerminalImageCell>>;
}

export function imageDimensions(width: number, cellHeight: number, lines: number) {
  const height = IMAGE_HEADER_HEIGHT + IMAGE_VERTICAL_PADDING * 2 + lines * cellHeight;
  const pixelWidth = Math.ceil(width * IMAGE_SCALE);
  const pixelHeight = Math.ceil(height * IMAGE_SCALE);
  if (![width, cellHeight, lines].every(value => Number.isFinite(value) && value > 0)) throw new Error("终端尺寸无效，请重新选择内容");
  if (Math.max(pixelWidth, pixelHeight) > MAX_IMAGE_DIMENSION || pixelWidth * pixelHeight > MAX_IMAGE_PIXELS) {
    throw new Error("选中内容过长，请减少行数后重新导出");
  }
  return { width, height, pixelWidth, pixelHeight };
}

export function imageExportError(reason: unknown, fallback: string): string {
  return reason && typeof reason === "object" && "message" in reason && typeof reason.message === "string" ? reason.message : fallback;
}
