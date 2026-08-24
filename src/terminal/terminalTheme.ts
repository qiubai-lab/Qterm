import type { ITheme } from "@xterm/xterm";

type ThemeConsumer = (theme: ITheme) => void;

const consumers = new Set<ThemeConsumer>();

const fallbackSearchColors = {
  matchBackground: "#153b35",
  activeMatchBackground: "#75e6cf",
};

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
  yellow: "#d4bd79",
  brightYellow: "#ead797",
  blue: "#79aef2",
  brightBlue: "#9fc5fa",
  magenta: "#c58ae8",
  brightMagenta: "#d9a8f3",
  cyan: "#68cbd6",
  brightCyan: "#91e1e8",
  white: "#d5d9dd",
  brightWhite: "#ffffff",
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
  yellow: "--terminal-ansi-yellow",
  brightYellow: "--terminal-ansi-bright-yellow",
  blue: "--terminal-ansi-blue",
  brightBlue: "--terminal-ansi-bright-blue",
  magenta: "--terminal-ansi-magenta",
  brightMagenta: "--terminal-ansi-bright-magenta",
  cyan: "--terminal-ansi-cyan",
  brightCyan: "--terminal-ansi-bright-cyan",
  white: "--terminal-ansi-white",
  brightWhite: "--terminal-ansi-bright-white",
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

export function readTerminalSearchColors(root: Element = document.documentElement): typeof fallbackSearchColors {
  const style = getComputedStyle(root);
  const hex = (property: string, fallback: string) => {
    const value = style.getPropertyValue(property).trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  };
  return {
    matchBackground: hex("--accent-bg", fallbackSearchColors.matchBackground),
    activeMatchBackground: hex("--accent", fallbackSearchColors.activeMatchBackground),
  };
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
