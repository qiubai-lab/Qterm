import { imageDimensions, type TerminalImageScale, type TerminalImageSnapshot } from "./terminalImageModel";

export const imageSizes = [{ label: "S", scale: 1 }, { label: "M", scale: 2 }, { label: "L", scale: 3 }] as const;

export function imageSizeDimensions(snapshot: TerminalImageSnapshot | null, scale: TerminalImageScale) {
  if (!snapshot) return null;
  try {
    return imageDimensions(snapshot.width, snapshot.cellHeight, snapshot.lines.length, scale);
  } catch {
    return null;
  }
}

export function defaultImageScale(snapshot: TerminalImageSnapshot | null): TerminalImageScale {
  return !snapshot || imageSizeDimensions(snapshot, 2) ? 2 : 1;
}
