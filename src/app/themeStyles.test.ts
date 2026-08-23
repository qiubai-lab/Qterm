// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCssBundle } from "../test/css";

const theme = readFileSync("src/app/styles/themes/dark.css", "utf8");
const lightTheme = readFileSync("src/app/styles/themes/light.css", "utf8");
const lightOverrides = readFileSync("src/app/styles/themes/lightOverrides.css", "utf8");
const styles = readCssBundle("src/app/app.css");
const main = readFileSync("src/main.tsx", "utf8");
const terminalPanel = readFileSync("src/terminal/TerminalPanel.tsx", "utf8");
const terminalChrome = readFileSync("src/terminal/terminalChrome.css", "utf8");
const terminalSurface = readFileSync("src/terminal/terminalSurface.css", "utf8");
const shell = readFileSync("src/app/styles/shell.css", "utf8");
const fileBrowser = readFileSync("src/files/fileBrowser.css", "utf8");
const network = readFileSync("src/network/network.css", "utf8");
const accessibilityOverrides = readFileSync("src/app/styles/lateOverrides.css", "utf8");
const credentialDialog = readFileSync("src/components/dialogs/credentialDialog.css", "utf8");
const connectionDialog = readFileSync("src/components/dialogs/connectionDialog.css", "utf8");
const settingsDialog = readFileSync("src/components/dialogs/settingsDialog.css", "utf8");
const aboutUpdate = readFileSync("src/components/dialogs/aboutUpdate.css", "utf8");
const dialogFrame = readFileSync("src/components/dialogs/dialogFrame.css", "utf8");
const buttons = readFileSync("src/components/button.css", "utf8");

describe("application theme contract", () => {
  it("owns the default dark theme at the application root", () => {
    expect(main).toContain('document.documentElement.dataset.theme ??= "dark"');
    expect(theme).toContain("color-scheme:dark");
    expect(lightTheme).toContain(':root[data-theme="light"]');
    expect(lightTheme).toContain("color-scheme:light");
  });

  it("defines shared semantic tokens for CSS and imperative renderers", () => {
    for (const token of [
      "--chrome", "--canvas", "--surface", "--raised", "--text", "--muted", "--accent", "--danger", "--focus",
      "--text-strong", "--text-disabled", "--icon", "--icon-hover", "--control-hover",
      "--block-border", "--block-border-active", "--block-header-background", "--block-header-active-background",
      "--scrollbar-track", "--scrollbar-thumb",
      "--terminal-background", "--terminal-foreground", "--terminal-cursor", "--terminal-selection", "--terminal-ansi-red",
      "--editor-background", "--editor-foreground", "--editor-gutter-background", "--editor-selection",
    ]) {
      expect(theme).toContain(`${token}:`);
      expect(lightTheme).toContain(`${token}:`);
    }
  });

  it("keeps workbench text and terminal edges on cross-theme semantic roles", () => {
    expect(terminalSurface).toContain("background:var(--scrollbar-track)");
    expect(terminalSurface).not.toContain("#050607");
    expect(terminalChrome).toContain("border:1px solid var(--block-border)");
    expect(terminalChrome).toContain("background:var(--block-header-background)");
    expect(terminalChrome).toContain("color:var(--text-strong)");
    expect(terminalChrome).toContain("color:var(--icon)");
    expect(shell).toContain("color:var(--text-strong)");
    expect(fileBrowser).toContain("color:var(--text)");
    expect(fileBrowser).toContain("color:var(--dim)");
    expect(network).toContain("color:var(--text)");
    expect(network).toContain("color:var(--muted)");
  });

  it("keeps every Light workbench text role readable on the base surface", () => {
    const surface = tokenHex(lightTheme, "--surface");
    for (const token of ["--text", "--text-strong", "--muted", "--dim", "--text-disabled", "--icon"]) {
      expect(contrastRatio(tokenHex(lightTheme, token), surface), `${token} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps accessibility fallbacks theme-neutral", () => {
    expect(accessibilityOverrides).toContain("prefers-reduced-transparency:reduce");
    expect(accessibilityOverrides).toContain("background:var(--block-header-background)");
    expect(accessibilityOverrides).toContain("background:var(--surface)");
    expect(accessibilityOverrides).not.toContain("#050708");
  });

  it("keeps manager pages and the connection picker on shared theme roles", () => {
    expect(credentialDialog).toMatch(/\.credential-list-pane[^}]+background:var\(--panel-bg\)/);
    expect(credentialDialog).toMatch(/\.credential-editor-pane[^}]+background:var\(--raised\)/);
    expect(credentialDialog).toMatch(/\.credential-editor-heading strong[^}]+color:var\(--text\)/);
    expect(connectionDialog).toMatch(/\.connection-sidebar[^}]+background:var\(--panel-bg\)/);
    expect(connectionDialog).toMatch(/\.connection-item\.selected[^}]+background:var\(--accent-bg\)/);
    expect(connectionDialog).toMatch(/\.connection-item-name[^}]+color:var\(--text\)/);
    expect(settingsDialog).toMatch(/\.settings-sidebar[^}]+background:var\(--panel-bg\)/);
    expect(settingsDialog).toMatch(/\.settings-content[^}]+background:var\(--raised\)/);
    expect(settingsDialog).toMatch(/\.settings-section-heading h3[^}]+color:var\(--text\)/);
    expect(aboutUpdate).toMatch(/\.update-check-status[^}]+background:var\(--panel-bg\)/);
    expect(aboutUpdate).toMatch(/\.update-check-status strong[^}]+color:var\(--text\)/);
    expect(terminalChrome).toMatch(/\.terminal-target-menu[^}]+border:1px solid var\(--border\)/);
    expect(terminalChrome).toMatch(/\.terminal-target-menu[^}]+background:color-mix\(in srgb,var\(--raised\) 96%,transparent\)/);
    expect(terminalChrome).toMatch(/\.terminal-target-option[^}]+color:var\(--muted\)/);
    expect(dialogFrame).not.toContain(".icon-button");
  });

  it("keeps shared action buttons semantic and outside Light compatibility patches", () => {
    expect(buttons).toContain(".ui-button--primary");
    expect(buttons).toContain("background:var(--accent)");
    expect(buttons).toContain(".ui-button--secondary");
    expect(buttons).toContain("background:var(--control-bg)");
    expect(buttons).toContain(".ui-button:focus-visible");
    expect(buttons).toContain("outline:2px solid var(--focus)");
    expect(buttons).toContain(".ui-button:disabled");
    expect(buttons).toContain(".ui-status-badge--success");
    expect(lightOverrides).not.toMatch(/:is\([^)]*\.(?:primary-button|secondary-button|danger-button|icon-button)/);
  });

  it("keeps xterm palette ownership outside the terminal component", () => {
    expect(terminalPanel).toContain('from "./terminalTheme"');
    expect(terminalPanel).not.toMatch(/#[0-9a-f]{6,8}/i);
  });

  it("makes CodeMirror consume editor semantic tokens", () => {
    expect(styles).toContain(".file-code-editor .cm-editor{height:100%;color:var(--editor-foreground);background:var(--editor-background)");
    expect(styles).toContain(".file-code-editor .cm-selectionBackground{background:var(--editor-selection)!important}");
  });

  it("isolates legacy Light compatibility selectors behind the theme root", () => {
    expect(lightOverrides).toContain('Transitional compatibility for legacy feature rules');
    expect(lightOverrides.match(/:root\[data-theme="light"\]/g)?.length).toBeGreaterThan(30);
    expect(lightOverrides).not.toMatch(/(^|\n)\.(?!settings-theme-preview)[^{]+\{/);
  });

  it("prevents the legacy raw-color budget from growing outside theme presets", () => {
    const legacyBudget: Record<string, number> = {
      "src/components/dialogs/connectionDialog.css": 206,
      "src/network/network.css": 164,
      "src/components/dialogs/credentialDialog.css": 110,
      "src/files/fileBrowser.css": 109,
      "src/terminal/terminalChrome.css": 75,
      "src/components/dialogs/settingsDialog.css": 63,
      "src/components/dialogs/controls.css": 53,
      "src/terminal/terminalSurface.css": 46,
      "src/components/dialogs/aboutUpdate.css": 38,
      "src/components/dialogs/infoDialogs.css": 25,
      "src/app/styles/shell.css": 25,
      "src/app/styles/lateOverrides.css": 24,
      "src/components/dialogs/connectionDialogFeedback.css": 22,
      "src/workspace/workspace.css": 15,
      "src/components/dialogs/forms.css": 15,
      "src/app/styles/notices.css": 9,
      "src/components/dialogs/dialogFrame.css": 8,
      "src/workspace/workspaceInteractions.css": 6,
    };
    for (const file of cssFiles("src")) {
      if (file.includes("/styles/themes/")) continue;
      const count = readFileSync(file, "utf8").match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/gi)?.length ?? 0;
      expect(count, `${file} raw-color budget`).toBeLessThanOrEqual(legacyBudget[file] ?? 0);
    }
  });
});

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry: { name: string; isDirectory: () => boolean }) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? cssFiles(path) : path.endsWith(".css") ? [path] : [];
  });
}

function tokenHex(css: string, token: string): string {
  const value = css.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  if (!value) throw new Error(`Missing solid color for ${token}`);
  return value;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
