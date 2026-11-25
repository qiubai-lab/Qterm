// Each workbench document owns the font size committed by its settings backend.
export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const MIN_TERMINAL_FONT_SIZE = 10;
export const MAX_TERMINAL_FONT_SIZE = 32;

let committed = DEFAULT_TERMINAL_FONT_SIZE;
const listeners = new Set<() => void>();

export function validTerminalFontSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_TERMINAL_FONT_SIZE && value <= MAX_TERMINAL_FONT_SIZE;
}

export function currentTerminalFontSize() {
  return committed;
}

export function commitTerminalFontSize(value: number | undefined) {
  const size = validTerminalFontSize(value) ? value : DEFAULT_TERMINAL_FONT_SIZE;
  if (committed === size) return;
  committed = size;
  listeners.forEach(listener => listener());
}

export function subscribeTerminalFontSize(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
