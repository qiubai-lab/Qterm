import type { ITheme } from "@xterm/xterm";

type ThemeConsumer = (theme: ITheme) => void;

const consumers = new Set<ThemeConsumer>();

const fallbackTheme = {
  background: "#00000000",
  foreground: "#f1f3f5",
  cursor: "#74e6d1",
  selectionBackground: "#2a5550",
  black: "#15171a",
  brightBlack: "#707780",
  green: "#74e6a5",
  brightGreen: "#9bf5bd",
  red: "#ff7770",
  brightRed: "#ff9b96",
  overviewRulerBorder: "#00000000",
  scrollbarSliderBackground: "#75e6cf80",
  scrollbarSliderHoverBackground: "#75e6cfa6",
  scrollbarSliderActiveBackground: "#75e6cfbf",
} satisfies ITheme;

const themeTokens = {
  background: "--terminal-background",
  foreground: "--terminal-foreground",
  cursor: "--terminal-cursor",
  selectionBackground: "--terminal-selection",
  black: "--terminal-ansi-black",
  brightBlack: "--terminal-ansi-bright-black",
  green: "--terminal-ansi-green",
  brightGreen: "--terminal-ansi-bright-green",
  red: "--terminal-ansi-red",
  brightRed: "--terminal-ansi-bright-red",
  overviewRulerBorder: "--terminal-background",
  scrollbarSliderBackground: "--terminal-scrollbar",
  scrollbarSliderHoverBackground: "--terminal-scrollbar-hover",
  scrollbarSliderActiveBackground: "--terminal-scrollbar-active",
} as const satisfies Record<keyof typeof fallbackTheme, string>;

export function readTerminalTheme(root: Element = document.documentElement): ITheme {
  const style = getComputedStyle(root);
  return Object.fromEntries(Object.entries(themeTokens).map(([key, token]) => [
    key,
    style.getPropertyValue(token).trim() || fallbackTheme[key as keyof typeof fallbackTheme],
  ])) as ITheme;
}

export function bindTerminalTheme(consumer: ThemeConsumer): { dispose: () => void } {
  consumers.add(consumer);
  consumer(readTerminalTheme());
  return { dispose: () => consumers.delete(consumer) };
}

export function refreshTerminalThemes(root: Element = document.documentElement): void {
  const theme = readTerminalTheme(root);
  consumers.forEach((consumer) => consumer(theme));
}
