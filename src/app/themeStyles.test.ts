// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCssBundle } from "../test/css";

const theme = readFileSync("src/app/styles/themes/dark.css", "utf8");
const styles = readCssBundle("src/app/app.css");
const main = readFileSync("src/main.tsx", "utf8");
const terminalPanel = readFileSync("src/terminal/TerminalPanel.tsx", "utf8");

describe("application theme contract", () => {
  it("owns the default dark theme at the application root", () => {
    expect(main).toContain('document.documentElement.dataset.theme ??= "dark"');
    expect(theme).toContain("color-scheme:dark");
  });

  it("defines shared semantic tokens for CSS and imperative renderers", () => {
    for (const token of [
      "--chrome", "--canvas", "--surface", "--raised", "--text", "--muted", "--accent", "--danger", "--focus",
      "--terminal-background", "--terminal-foreground", "--terminal-cursor", "--terminal-selection", "--terminal-ansi-red",
      "--editor-background", "--editor-foreground", "--editor-gutter-background", "--editor-selection",
    ]) expect(theme).toContain(`${token}:`);
  });

  it("keeps xterm palette ownership outside the terminal component", () => {
    expect(terminalPanel).toContain('from "./terminalTheme"');
    expect(terminalPanel).not.toMatch(/#[0-9a-f]{6,8}/i);
  });

  it("makes CodeMirror consume editor semantic tokens", () => {
    expect(styles).toContain(".file-code-editor .cm-editor{height:100%;color:var(--editor-foreground);background:var(--editor-background)");
    expect(styles).toContain(".file-code-editor .cm-selectionBackground{background:var(--editor-selection)!important}");
  });
});
