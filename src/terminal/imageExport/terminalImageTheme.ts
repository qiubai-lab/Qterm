import type { ITheme } from "@xterm/xterm";
import type { AppTheme } from "../../lib/tauri/settings";
import { readTerminalTheme } from "../terminalTheme";
import type { CellColor } from "./terminalImageModel";

export interface TerminalImagePalette {
  foreground: string;
  background: string;
  header: string;
  border: string;
  muted: string;
  colors: string[];
}

const ansiNames: Array<keyof ITheme> = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"];

export function readImagePalette(theme: AppTheme): TerminalImagePalette {
  const probe = document.createElement("div");
  probe.dataset.terminalImageTheme = theme;
  probe.hidden = true;
  document.body.append(probe);
  try {
    const terminal = readTerminalTheme(probe);
    const style = getComputedStyle(probe);
    const token = (name: string) => style.getPropertyValue(name).trim();
    return {
      foreground: terminal.foreground!, background: token("--surface"),
      header: token("--raised"), border: token("--border"), muted: token("--muted"),
      colors: ansiNames.map(name => terminal[name] as string),
    };
  } finally { probe.remove(); }
}

export function resolveCellColor(color: CellColor, fallback: string, palette: TerminalImagePalette, bright = false): string {
  if (color.mode === "default") return fallback;
  if (color.mode === "rgb") return `#${color.value.toString(16).padStart(6, "0")}`;
  const index = color.value < 8 && bright ? color.value + 8 : color.value;
  if (index < 16) return palette.colors[index];
  if (index >= 232) {
    const channel = (8 + (index - 232) * 10).toString(16).padStart(2, "0");
    return `#${channel.repeat(3)}`;
  }
  const value = index - 16;
  const steps = [0, 95, 135, 175, 215, 255];
  return `#${[steps[Math.floor(value / 36)], steps[Math.floor(value / 6) % 6], steps[value % 6]].map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}
