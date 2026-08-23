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
const dialogControls = readFileSync("src/components/dialogs/controls.css", "utf8");
const connectionFeedback = readFileSync("src/components/dialogs/connectionDialogFeedback.css", "utf8");
const infoDialogs = readFileSync("src/components/dialogs/InfoDialogs.tsx", "utf8");
const networkAccessDialog = readFileSync("src/network/NetworkAccessDialog.tsx", "utf8");
const connectionDialogComponent = readFileSync("src/components/dialogs/ConnectionDialog.tsx", "utf8");
const fileBrowserComponent = readFileSync("src/files/FileBrowserPane.tsx", "utf8");
const notices = readFileSync("src/app/styles/notices.css", "utf8");

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
      "--chrome-action-hover", "--chrome-action-pressed", "--chrome-action-border",
      "--block-border", "--block-border-active", "--block-header-background", "--block-header-active-background",
      "--block-active-ring", "--block-active-inset", "--block-active-shadow", "--block-active-surface-shadow", "--block-active-indicator-shadow",
      "--workspace-tab-active-border", "--workspace-tab-active-background", "--workspace-tab-active-shadow",
      "--workspace-tab-hover-border", "--workspace-tab-hover-background",
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

  it("keeps Light typography calm while preserving an ordered readable hierarchy", () => {
    const surface = tokenHex(lightTheme, "--surface");
    const hierarchy = ["--text-strong", "--text", "--muted", "--dim"].map((token) => contrastRatio(tokenHex(lightTheme, token), surface));
    expect(hierarchy[0]).toBeGreaterThan(hierarchy[1]);
    expect(hierarchy[1]).toBeGreaterThan(hierarchy[2]);
    expect(hierarchy[2]).toBeGreaterThan(hierarchy[3]);
    expect(hierarchy[0], "strong text should avoid near-black contrast").toBeLessThanOrEqual(15.5);
    expect(hierarchy[1], "ordinary text should avoid near-black contrast").toBeLessThanOrEqual(13);
    expect(contrastRatio(tokenHex(lightTheme, "--terminal-foreground"), tokenHex(lightTheme, "--editor-background")), "terminal foreground contrast").toBeLessThanOrEqual(13);
    expect(contrastRatio(tokenHex(lightTheme, "--editor-foreground"), tokenHex(lightTheme, "--editor-background")), "editor foreground contrast").toBeLessThanOrEqual(13);
  });

  it("makes active workbench emphasis fully theme-owned", () => {
    expect(contrastRatio(tokenHex(lightTheme, "--block-border-active"), tokenHex(lightTheme, "--surface")), "Light active outline contrast").toBeGreaterThanOrEqual(4.5);
    expect(terminalChrome).toMatch(/\.terminal-block\.active[^}]+box-shadow:var\(--block-active-surface-shadow\)/);
    expect(terminalChrome).toMatch(/\.active-block-indicator[^}]+border:1px solid var\(--block-border-active\)/);
    expect(terminalChrome).toMatch(/\.active-block-indicator[^}]+box-shadow:var\(--block-active-indicator-shadow\)/);
    expect(shell).toMatch(/\.workspace-tab-selection[^}]+border:1px solid var\(--workspace-tab-active-border\)[^}]+background:var\(--workspace-tab-active-background\)[^}]+box-shadow:var\(--workspace-tab-active-shadow\)/);
  });

  it("keeps Light selection shadows inside clipped workbench clearances", () => {
    expect(tokenValue(lightTheme, "--workspace-tab-active-shadow")).not.toContain("#0003");
    expect(tokenValue(lightTheme, "--workspace-tab-active-shadow")).not.toMatch(/0\s+3px\s+10px/);
    expect(tokenValue(lightTheme, "--block-active-surface-shadow")).not.toMatch(/0\s+0\s+(?:14|18)px/);
    expect(tokenValue(lightTheme, "--block-active-indicator-shadow")).not.toMatch(/0\s+0\s+(?:14|18)px/);
    expect(tokenValue(theme, "--workspace-tab-active-shadow")).toContain("0 3px 10px #0003");
    expect(tokenValue(theme, "--block-active-indicator-shadow")).toContain("0 0 18px var(--block-active-shadow)");
  });

  it("keeps Light action and warning labels readable on their control surfaces", () => {
    expect(contrastRatio(tokenHex(lightTheme, "--accent-contrast"), tokenHex(lightTheme, "--accent")), "primary button contrast").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokenHex(lightTheme, "--text"), tokenHex(lightTheme, "--control-bg")), "secondary button contrast").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokenHex(lightTheme, "--danger"), tokenHex(lightTheme, "--danger-bg")), "failure notice contrast").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokenHex(lightTheme, "--warning"), tokenHex(lightTheme, "--warning-bg")), "warning tag contrast").toBeGreaterThanOrEqual(4.5);
  });

  it("gives compact chrome actions a dedicated cross-theme emphasis contract", () => {
    expect(tokenValue(theme, "--chrome-action-hover")).not.toBe(tokenValue(theme, "--control-hover"));
    expect(tokenValue(lightTheme, "--chrome-action-hover")).not.toBe(tokenValue(lightTheme, "--control-hover"));
    expect(tokenValue(lightTheme, "--workspace-tab-hover-background")).not.toBe(tokenValue(lightTheme, "--hover"));
    expect(tokenValue(theme, "--chrome-action-hover")).not.toBe(tokenValue(theme, "--chrome-action-pressed"));
    expect(tokenValue(lightTheme, "--chrome-action-hover")).not.toBe(tokenValue(lightTheme, "--chrome-action-pressed"));
    expect(shell).toMatch(/\.workspace-tab-close\.ui-icon-button:hover:not\(:disabled\),\.new-workspace-tab\.ui-icon-button:hover:not\(:disabled\)[^}]+border-color:var\(--chrome-action-border\)[^}]+background:var\(--chrome-action-hover\)/);
    expect(shell).toMatch(/\.workspace-tab:hover:not\(\.selected\)[^}]+border-color:var\(--workspace-tab-hover-border\)[^}]+background:var\(--workspace-tab-hover-background\)/);
    expect(shell).toMatch(/\.window-controls button:not\(\.window-close\):hover[^}]+background:var\(--chrome-action-hover\)[^}]+var\(--chrome-action-border\)/);
    expect(shell).toMatch(/\.window-controls button:not\(\.window-close\):active[^}]+background:var\(--chrome-action-pressed\)/);
    expect(shell).toMatch(/\.window-controls \.window-close:hover[^}]+background:#c42b1c[^}]+box-shadow:none/);
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
    expect(connectionDialog).toMatch(/\.connection-item-name[^}]+color:var\(--muted\)/);
    expect(connectionDialog).toMatch(/\.connection-item:hover \.connection-item-name[^}]+color:var\(--text\)/);
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

  it("keeps guidance and failure feedback on shared semantic roles", () => {
    expect(credentialDialog).toMatch(/\.credential-detail-note[^}]+border:1px solid color-mix\(in srgb,var\(--accent\)[^}]+color:var\(--accent\)[^}]+background:var\(--panel-bg\)/);
    expect(credentialDialog).toMatch(/\.credential-detail-note p[^}]+color:var\(--muted\)/);
    expect(notices).toMatch(/\.block-notice[^}]+border:1px solid color-mix\(in srgb,var\(--danger\)[^}]+color:var\(--danger\)[^}]+background:color-mix\(in srgb,var\(--danger-bg\)/);
    expect(notices).toMatch(/\.global-notice[^}]+border:1px solid color-mix\(in srgb,var\(--danger\)[^}]+color:var\(--danger\)[^}]+background:color-mix\(in srgb,var\(--danger-bg\)/);
    expect(terminalSurface).not.toContain(".block-notice");
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

  it("keeps busy actions readable and experimental labels on one shared contract", () => {
    expect(buttons).toMatch(/\.ui-button\[aria-busy="true"\]:disabled[^}]+opacity:1/);
    expect(buttons).toMatch(/\.ui-icon-button\[aria-busy="true"\]:disabled[^}]+opacity:1/);
    expect(buttons).toContain(".ui-status-badge--tag");
    expect(buttons).toContain(".ui-status-badge--compact");
    expect(infoDialogs).toMatch(/<Button\s+size="compact"\s+className="update-check-copy"/);
    expect(infoDialogs).toMatch(/<IconButton\s+label="重新检测"/);
    expect(networkAccessDialog).toContain('<StatusBadge tone="warning" presentation="tag"');
    expect(networkAccessDialog).toContain('<IconButton label={`复制${field.label}`}');
    expect(connectionDialogComponent).toContain('<StatusBadge tone="warning" presentation="tag"');
    expect(fileBrowserComponent).toContain('<StatusBadge tone="warning" presentation="tag"');
    expect(connectionFeedback).toMatch(/\.auth-method-indicator[^}]+background:var\(--accent-bg\)/);
    expect(connectionFeedback).toMatch(/\.agent-auth-note[^}]+background:var\(--panel-bg\)/);
  });

  it("keeps feature choice surfaces and preview chrome on semantic theme roles", () => {
    expect(network).toMatch(/\.network-type-option[^}]+background:var\(--panel-bg\)/);
    expect(network).toMatch(/\.network-rule-flow[^}]+background:var\(--panel-bg\)/);
    expect(network).toMatch(/\.network-exposure-note[^}]+background:var\(--accent-bg\)/);
    expect(dialogControls).toMatch(/\.terminal-lock-options>button[^}]+background:var\(--panel-bg\)/);
    expect(connectionDialog).toMatch(/\.jump-picker-list[^}]+background:var\(--raised\)/);
    expect(connectionDialog).toMatch(/\.jump-picker-option[^}]+background:var\(--panel-bg\)/);
    expect(connectionDialog).toMatch(/\.jump-picker-actions[^}]+background:var\(--raised\)/);
    expect(connectionDialog).toMatch(/\.ssh-config-import-list[^}]+background:var\(--raised\)/);
    expect(connectionDialog).toMatch(/\.jump-route-flow[^}]+background:var\(--panel-bg\)/);
    expect(connectionDialog).toMatch(/\.credential-reference-locked[^}]+background:var\(--control-bg\)/);
    expect(dialogControls).toMatch(/\.vault-status-card[^}]+background:var\(--accent-bg\)/);
    expect(fileBrowser).toMatch(/\.file-preview-toolbar[^}]+background:var\(--block-header-background\)/);
    expect(fileBrowser).toMatch(/\.file-markdown-preview[^}]+color:var\(--text\)/);
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

function tokenValue(css: string, token: string): string {
  const value = css.match(new RegExp(`${token}:\\s*([^;]+);`, "i"))?.[1].trim();
  if (!value) throw new Error(`Missing value for ${token}`);
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
