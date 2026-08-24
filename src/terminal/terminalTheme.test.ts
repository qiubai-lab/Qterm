import { afterEach, describe, expect, it, vi } from "vitest";
import { bindTerminalTheme, readTerminalSearchColors, readTerminalTheme, refreshTerminalThemes } from "./terminalTheme";

const tokens = ["--terminal-foreground", "--terminal-cursor", "--terminal-scrollbar", "--terminal-ansi-blue", "--terminal-ansi-bright-white"];

describe("terminal theme adapter", () => {
  afterEach(() => tokens.forEach((token) => document.documentElement.style.removeProperty(token)));

  it("reads semantic CSS tokens with stable dark fallbacks", () => {
    expect(readTerminalTheme()).toMatchObject({
      background: "#00000000",
      foreground: "#f1f3f5",
      cursor: "#74e6d1",
    });

    document.documentElement.style.setProperty("--terminal-foreground", "#abcdef");
    document.documentElement.style.setProperty("--terminal-cursor", "#123456");
    document.documentElement.style.setProperty("--terminal-ansi-blue", "#2468ac");
    document.documentElement.style.setProperty("--terminal-ansi-bright-white", "#fedcba");

    expect(readTerminalTheme()).toMatchObject({ foreground: "#abcdef", cursor: "#123456", blue: "#2468ac", brightWhite: "#fedcba" });
  });

  it("refreshes every live terminal consumer and releases disposed views", () => {
    const first = vi.fn();
    const second = vi.fn();
    const firstBinding = bindTerminalTheme(first);
    const secondBinding = bindTerminalTheme(second);
    first.mockClear();
    second.mockClear();
    document.documentElement.style.setProperty("--terminal-scrollbar", "#102030");

    refreshTerminalThemes();

    expect(first).toHaveBeenCalledWith(expect.objectContaining({ scrollbarSliderBackground: "#102030" }));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ scrollbarSliderBackground: "#102030" }));
    firstBinding.dispose();
    secondBinding.dispose();
    first.mockClear();
    second.mockClear();

    refreshTerminalThemes();

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("reads search decorations from semantic accent tokens", () => {
    expect(readTerminalSearchColors()).toEqual({ matchBackground: "#153b35", activeMatchBackground: "#75e6cf" });
    document.documentElement.style.setProperty("--accent-bg", "#112233");
    document.documentElement.style.setProperty("--accent", "#abcdef");
    expect(readTerminalSearchColors()).toEqual({ matchBackground: "#112233", activeMatchBackground: "#abcdef" });
    document.documentElement.style.removeProperty("--accent-bg");
    document.documentElement.style.removeProperty("--accent");
  });
});
