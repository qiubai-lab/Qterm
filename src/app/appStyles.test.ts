import { describe, expect, it } from "vitest";
import { readCssBundle } from "../test/css";

// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";

const styles = readCssBundle("src/app/app.css");
const lightOverrides = readFileSync("src/app/styles/themes/lightOverrides.css", "utf8");
const defaultCapability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as { permissions: string[] };
const workspaceShellSource = readFileSync("src/workspace/WorkspaceShell.tsx", "utf8");
const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as {
  app: { windows: Array<{ theme?: string; transparent?: boolean; shadow?: boolean; windowEffects?: { effects: string[]; state?: string; radius?: number } }> };
};
const macosTauriConfig = JSON.parse(readFileSync("src-tauri/tauri.macos.conf.json", "utf8")) as {
  app: { windows: Array<{ decorations?: boolean; titleBarStyle?: string; trafficLightPosition?: { x: number; y: number }; windowEffects?: { effects: string[]; state?: string; radius?: number } }> };
};

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`(?:^|}|,)\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

function lastDeclarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`(?:^|}|,)\\s*${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  return matches[matches.length - 1]?.[1] ?? "";
}

describe("application layout styles", () => {
  it("highlights only the active always-on-top icon and grants only its required window permissions", () => {
    const activePin = declarations('.window-controls .window-pin[aria-pressed="true"]');
    const activePinHover = declarations('.window-controls .window-pin[aria-pressed="true"]:hover');
    const activePinPressed = declarations('.window-controls .window-pin[aria-pressed="true"]:active');
    expect(activePin).toContain("color:var(--navigation-accent)");
    expect(activePin).toContain("background:transparent");
    expect(activePin).toContain("box-shadow:none");
    expect(activePinHover).toContain("color:var(--navigation-accent)");
    expect(activePinHover).toContain("background:var(--chrome-action-hover)");
    expect(activePinHover).toContain("border-color:var(--chrome-action-border)");
    expect(activePinHover).toContain("box-shadow:none");
    expect(activePinPressed).toContain("background:transparent");
    expect(activePinPressed).toContain("box-shadow:none");
    const ordinaryHover = declarations('.window-controls button:not(.window-close):not(.window-pin[aria-pressed="true"]):hover');
    expect(ordinaryHover).toContain("background:var(--chrome-action-hover)");
    expect(ordinaryHover).toContain("border-color:var(--chrome-action-border)");
    expect(ordinaryHover).toContain("box-shadow:none");
    expect(declarations(".window-controls button")).toContain("border:1px solid transparent");
    expect(declarations(".window-controls button")).toContain("border-color .1s ease");
    expect(declarations(".window-controls button")).not.toContain("box-shadow .1s ease");
    expect(declarations(".window-controls button")).not.toContain("transform .12s");
    expect(styles).not.toContain(".window-controls button:active { transform:scale(.97)");
    expect(declarations(".window-controls button:focus-visible")).toContain("outline:2px solid var(--focus)");
    expect(defaultCapability.permissions).toContain("core:window:allow-is-always-on-top");
    expect(defaultCapability.permissions).toContain("core:window:allow-set-always-on-top");
    expect(defaultCapability.permissions).toContain("core:window:allow-destroy");
  });

  it("uses the current theme action color for ordinary context-menu hover", () => {
    const root = declarations(":root");
    const cyberpunk = declarations(':root[data-theme="cyberpunk"]');
    expect(root).toContain("--menu-hover-background:var(--primary-action)");
    expect(root).toContain("--menu-hover-text:var(--primary-action-contrast)");
    expect(cyberpunk).toContain("--primary-action:#fcee0a");
    expect(cyberpunk).toContain("--primary-action-contrast:#171500");
    expect(styles).toContain(":is(.connection-context-menu,.file-context-menu,.network-context-menu,.terminal-context-menu) button:hover:not(:disabled):not(.danger)");
    expect(styles).toContain("color:var(--menu-hover-text);background:var(--menu-hover-background)");
    expect(styles).toContain(".terminal-context-menu button:hover:not(:disabled):not(.danger) kbd");
    expect(styles).toContain(":is(.connection-context-menu,.file-context-menu,.network-context-menu,.terminal-context-menu) button{color:var(--menu-text)}");
    expect(styles).toContain(":is(.connection-context-menu,.file-context-menu,.network-context-menu,.terminal-context-menu) kbd{color:var(--menu-secondary-text)}");
    expect(styles).toContain(":is(.connection-context-menu,.file-context-menu,.network-context-menu,.terminal-context-menu) button:disabled,:is(.connection-context-menu,.file-context-menu,.network-context-menu,.terminal-context-menu) button.danger:disabled{color:var(--menu-disabled-text);background:transparent;opacity:1}");
    expect(styles).toContain(":is(.connection-context-menu,.file-context-menu,.network-context-menu,.terminal-context-menu) button:disabled :is(svg,kbd){color:currentColor}");
    expect(lightOverrides).not.toMatch(/(?:file|connection|profile)-context-menu/);
  });

  it("uses one restrained danger marker for required field labels", () => {
    expect(declarations(".required-field-label")).toContain("display:inline-flex");
    expect(declarations(".required-field-label")).toContain("align-items:center");
    expect(declarations(".required-field-mark")).toContain("display:inline-flex");
    expect(declarations(".required-field-mark")).toContain("align-self:center");
    expect(declarations(".required-field-mark::before")).toContain("color:var(--danger)");
    expect(declarations(".required-field-mark::before")).toContain('content:"∗"');
  });

  it("keeps a small visual gap between adjacent connection selections", () => {
    expect(declarations(".connection-item+.connection-item")).toContain("margin-top:2px");
  });

  it("keeps the target picker outside block clipping with one bounded list scroller", () => {
    expect(declarations(".terminal-target-menu")).toContain("position:fixed");
    expect(declarations(".terminal-target-menu")).toContain("min-height:0");
    expect(declarations(".terminal-target-menu")).toContain("overflow:hidden");
    expect(declarations(".terminal-target-search")).toContain("flex:none");
    expect(declarations(".terminal-target-search input")).toContain("margin:0");
    expect(declarations(".terminal-target-search input")).toContain("box-shadow:none");
    expect(declarations(".terminal-target-search input:focus,.terminal-target-search input:focus-visible")).toContain("box-shadow:none");
    expect(declarations(".terminal-target-local")).toContain("flex:none");
    expect(declarations(".terminal-target-list")).toContain("min-height:0");
    expect(declarations(".terminal-target-list")).toContain("overflow:auto");
    expect(declarations(".terminal-target-list")).toContain("scrollbar-gutter:stable");
    expect(declarations(".terminal-target-manage")).toContain("flex:none");
    expect(declarations(".terminal-target-submenu")).toContain("position:fixed");
    expect(declarations(".terminal-target-submenu")).toContain("overflow:hidden");
    expect(declarations(".terminal-target-submenu")).toContain("padding:4px 9px 4px 4px");
    expect(declarations(".terminal-target-submenu-list")).toContain("height:100%");
    expect(declarations(".terminal-target-submenu-list")).toContain("overflow-y:auto");
    expect(declarations(".terminal-target-submenu-list")).toContain("scrollbar-width:none");
    expect(declarations(".terminal-target-option+.terminal-target-option")).toContain("margin-top:2px");
    expect(declarations('.terminal-target-option:hover:not([aria-pressed="true"]),.terminal-target-option:focus-visible:not([aria-pressed="true"])')).toContain("background:color-mix(in srgb,var(--accent) 16%,var(--panel-bg))");
    expect(declarations('.terminal-target-option:hover:not([aria-pressed="true"]),.terminal-target-option:focus-visible:not([aria-pressed="true"])')).toContain("color-mix(in srgb,var(--accent) 34%,transparent)");
    expect(declarations('.terminal-target-option:hover:not([aria-pressed="true"]) small,.terminal-target-option:focus-visible:not([aria-pressed="true"]) small')).toContain("color-mix(in srgb,var(--accent) 52%,var(--muted))");
    expect(declarations(".terminal-target-group-entry")).toContain("minmax(0,1fr) auto");
    expect(declarations(".terminal-target-group-meta")).toContain("align-items:center");
    expect(declarations(".terminal-target-group-meta")).toContain("justify-content:flex-end");
    expect(declarations(".terminal-target-group-meta small")).toContain("height:18px");
    expect(declarations(".terminal-target-group-arrow")).toContain("place-items:center");
    expect(declarations(".terminal-target-group-arrow::before")).toContain("rotate(45deg)");
    expect(declarations(".terminal-target-scrollbar")).toContain("opacity:0");
    expect(declarations('.terminal-target-submenu[data-scrollable="true"][data-scrollbar-visible="true"]>.terminal-target-scrollbar')).toContain("opacity:1");
    expect(declarations(".terminal-target-scrollbar>span")).toContain("--terminal-target-scroll-thumb-offset");
    expect(declarations('.terminal-target-submenu[data-placement="left"]')).toContain("transform-origin:right top");
    expect(styles).toContain(".connection-context-menu,.file-context-menu,.network-context-menu,.terminal-context-menu,.terminal-target-menu,.terminal-target-submenu,.dialog-frame{background:var(--raised)}");
  });

  it("collapses the connected endpoint before persistent route status", () => {
    expect(declarations(".terminal-block")).toContain("container-type:inline-size");
    expect(declarations(".connection-route-progress")).not.toContain("position:absolute");
    expect(declarations(".connection-route-progress")).toContain("display:flex");
    expect(declarations(".connection-route-progress")).toContain("min-width:0");
    expect(declarations(".connection-route-progress")).toContain("overflow:hidden");
    expect(declarations(".connection-route-dots")).toContain("flex:none");
    expect(declarations(".terminal-target")).toContain("min-width:0");
    expect(declarations(".terminal-target")).toContain("flex:0 1 auto");
    expect(declarations(".terminal-target-trigger")).toContain("flex:0 1 auto");
    expect(declarations('.terminal-block.active .terminal-target[data-remote="true"][data-status="connected"] .terminal-target-endpoint')).toContain("color:var(--block-active-endpoint-text)");
    expect(declarations(".terminal-block.active .connection-route-progress.connected .connection-route-endpoint")).toContain("color:var(--block-active-endpoint-text)");
    expect(declarations(".connection-route-endpoint")).toContain("text-overflow:ellipsis");
    expect(declarations(".connection-route-endpoint")).toContain("flex:0 1 auto");
    expect(styles).toMatch(/@container terminal-block \(max-width:390px\)\{\.terminal-target>small,\.terminal-target-endpoint,\.connection-route-endpoint,\.terminal-osc7-tag\{display:none\}\}/);
    expect(styles).not.toContain(".connection-route-progress{display:none}");
    expect(declarations(".block-actions")).toContain("flex:none");
    expect(declarations(".terminal-header-secondary-actions")).toContain("display:flex");
    expect(declarations(".block-actions .terminal-header-more")).toContain("display:none");
    expect(styles).toMatch(/@container terminal-block \(max-width:300px\)\{\.terminal-header-secondary-actions\{display:none\}\.block-actions \.terminal-header-more\{display:grid\}\}/);
  });

  it("keeps local-terminal attention in the terminal title's current theme color", () => {
    const activeTarget = declarations(".terminal-block.active .terminal-target-trigger");
    const attention = declarations(".local-terminal-attention");
    expect(activeTarget).toContain("color:var(--selection-marker)");
    expect(attention).toContain("animation:local-terminal-attention 2.5s ease-in-out both");
    expect(styles).toContain("color-mix(in srgb,currentColor 62%,transparent)");
    expect(styles).toContain("color-mix(in srgb,currentColor 45%,transparent)");
    expect(styles).not.toContain(".local-terminal-attention{animation:none;color:var(--accent)");
  });

  it("reserves the full OSC 7 theme highlight for the active terminal", () => {
    const tag = declarations(".terminal-osc7-tag");
    const tagText = declarations(".terminal-osc7-tag>span");
    const ready = declarations('.terminal-osc7-tag[data-state="ready"]');
    const attention = declarations('.terminal-osc7-tag[data-state="attention"]');
    const inactiveHover = declarations('.terminal-block:not(.active) .terminal-osc7-tag[data-state="ready"]:hover');
    const activeReady = declarations('.terminal-block.active .terminal-osc7-tag[data-state="ready"]');
    expect(tag).toContain("color:var(--dim)");
    expect(tag).toContain("flex:none");
    expect(tag).toContain("height:12px");
    expect(tag).toContain("padding:0 3px");
    expect(tag).toContain("border-radius:3px");
    expect(tag).toContain('font:700 7px/10px "SFMono-Regular",Consolas,monospace');
    expect(tag).toContain("background:transparent");
    expect(tagText).toContain("display:block");
    expect(tagText).not.toContain("transform:");
    expect(ready).toContain("--osc7-tag-border:color-mix(in srgb,var(--selection-marker) 20%,var(--border))");
    expect(ready).toContain("--osc7-tag-text:color-mix(in srgb,var(--selection-marker) 55%,var(--dim))");
    expect(ready).toContain("--osc7-tag-surface:transparent");
    expect(ready).toContain("border-color:var(--osc7-tag-border)");
    expect(inactiveHover).toContain("--osc7-tag-text:color-mix(in srgb,var(--selection-marker) 78%,var(--dim))");
    expect(activeReady).toContain("--osc7-tag-text:var(--selection-marker)");
    expect(activeReady).toContain("--osc7-tag-surface:color-mix(in srgb,var(--selection-surface) 72%,transparent)");
    expect(attention).toContain("border-color:var(--danger)");
    expect(attention).toContain("color:var(--danger)");
    expect(attention).toContain("animation:osc7-tag-attention 2.5s ease-in-out both");
    expect(styles).toContain("@keyframes osc7-tag-attention");
    expect(styles).toContain('@media(prefers-reduced-motion:reduce){.terminal-osc7-tag[data-state="attention"]');
  });

  it("keeps route node details in a compact two-line tooltip", () => {
    const tooltip = declarations(".connection-route-tooltip");
    expect(tooltip).toContain("position:fixed");
    expect(tooltip).toContain("max-width:min(210px,calc(100vw - 16px))");
    expect(tooltip).toContain("gap:1px");
    expect(tooltip).toContain("padding:4px 7px");
    expect(tooltip).toContain("border:1px solid color-mix(in srgb,var(--warning) 48%,var(--floating-border))");
    expect(tooltip).toContain("color:var(--warning)");
    expect(tooltip).toContain("background:var(--floating-material)");
    expect(tooltip).toContain("box-shadow:0 8px 24px var(--shadow-strong)");
    expect(declarations(".connection-route-tooltip strong")).toContain("color:var(--text)");
    expect(lastDeclarations(".connection-route-tooltip-detail>small")).toContain("color:var(--dim)");
    expect(declarations(".connection-route-tooltip.connected")).toContain("color:var(--accent)");
    expect(declarations(".connection-route-tooltip-detail")).toContain("display:flex");
    expect(declarations(".connection-route-tooltip-detail")).toContain("align-items:baseline");
    expect(styles).toMatch(/prefers-reduced-transparency:reduce[\s\S]*\.connection-route-tooltip,\.host-summary-popover\{background:var\(--raised\);backdrop-filter:none/);
  });

  it("uses one themed interactive host identity and compact floating summary", () => {
    expect(declarations(".host-identity-trigger")).toContain("color:var(--dim)");
    expect(declarations('.host-identity-trigger[aria-expanded="true"]')).toContain("color:var(--block-active-endpoint-text)");
    const popover = declarations(".host-summary-popover");
    expect(popover).toContain("position:fixed");
    expect(popover).toContain("border:1px solid var(--floating-border)");
    expect(popover).toContain("background:var(--floating-material)");
    expect(popover).toContain("box-shadow:var(--floating-shadow)");
    expect(styles).toContain("@keyframes host-summary-in{from{opacity:0}to{opacity:1}}");
    expect(styles).not.toMatch(/@keyframes host-summary-in\{[^}]*transform:/);
    expect(declarations(".host-summary-endpoint dd")).toContain("color:var(--block-active-endpoint-text)");
    expect(styles).toMatch(/prefers-reduced-transparency:reduce[\s\S]*\.connection-route-tooltip,\.host-summary-popover\{background:var\(--raised\);backdrop-filter:none/);
  });

  it("keeps SSH Config import content in one bounded manager scroller", () => {
    expect(declarations(".ssh-config-import-dialog .dialog-content")).toContain("overflow:hidden");
    expect(declarations(".ssh-config-import-list")).toContain("min-height:0");
    expect(declarations(".ssh-config-import-list")).toContain("overflow:auto");
    expect(declarations(".ssh-config-import-panel")).toContain("min-height:0");
    expect(declarations(".ssh-config-import-panel")).toContain("overflow:hidden");
    expect(declarations(".connection-editor-tabs.ssh-config-import-tabs")).toContain("grid-template-columns:1fr 1fr");
    expect(declarations(".connection-editor-tabs.ssh-config-import-tabs")).toContain("margin:7px 10px 6px");
    expect(declarations(".ssh-config-import-tabs .connection-editor-tab-indicator")).toContain("width:calc(50% - 3px)");
    expect(declarations(".ssh-config-import-prompt-copy")).toContain("display:grid");
    expect(declarations(".ssh-config-import-source-label")).toContain("max-width:160px");
    expect(declarations(".ssh-config-import-dialog .ssh-config-import-source-label")).toContain("height:26px");
    expect(declarations(".ssh-config-import-dialog .ssh-config-import-source-label")).toContain("background:#15191c");
    expect(declarations(".ssh-config-import-source-label>span")).toContain("text-overflow:ellipsis");
    expect(declarations(".ui-button.ssh-config-import-reselect")).toContain("height:26px");
    expect(declarations(".ssh-config-import-dialog .ui-icon-button")).toContain("height:26px");
    expect(declarations(".ssh-config-import-dialog .ssh-config-import-choice")).toContain("min-height:40px");
    expect(declarations(".ssh-config-import-choice,.ssh-config-key-option>label")).toContain("margin:0");
    expect(styles).toContain(".ssh-config-import-choice>input,.ssh-config-key-option>label input{accent-color:var(--selection-marker)}");
    expect(declarations(".ssh-config-import-dialog .ssh-config-import-item")).toContain("margin-bottom:5px");
    expect(declarations(".ssh-config-import-dialog .ssh-config-import-item.selected")).toContain("background:var(--selection-surface)");
    expect(declarations(".ssh-config-import-dialog .ssh-config-import-item.selected")).toContain("box-shadow:inset 2px 0 var(--selection-marker)");
    expect(declarations(".ssh-config-import-actions")).toContain("flex:none");
    expect(declarations(".connection-import-button")).toContain("white-space:nowrap");
  });

  it("slides one shared selection surface between workspace tabs", () => {
    expect(declarations(".workspace-tab-strip")).toContain("position:relative");
    expect(declarations(".workspace-tab-selection")).toContain("position:absolute");
    expect(declarations(".workspace-tab-selection")).toContain("pointer-events:none");
    expect(declarations(".workspace-tab-selection.ready")).toContain("transform 250ms cubic-bezier(.2,.8,.2,1)");
    expect(declarations(".workspace-tab.selected")).not.toContain("background:");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.workspace-tab-selection\.ready\{transition:none\}/);
  });

  it("keeps dragged workspace tabs attached to the pointer while the drop target makes room", () => {
    expect(declarations(".workspace-tab")).toContain("transition:transform 140ms cubic-bezier(.2,.8,.2,1)");
    expect(declarations(".workspace-tab.dragging")).toContain("transform:translate3d(var(--workspace-tab-drag-x),-1px,0) scale(1.01)");
    expect(declarations(".workspace-tab.dragging")).toContain("border-color:var(--border)");
    expect(declarations(".workspace-tab.dragging")).toContain("background:var(--raised)");
    expect(declarations(".workspace-tab.dragging")).toContain("pointer-events:none");
    expect(declarations(".workspace-tab.dragging :focus-visible")).toContain("outline:none");
    expect(declarations('.workspace-tab[data-drop-shift="left"]')).toContain("transform:translate3d(calc((var(--workspace-tab-width) + 3px) * -1),0,0)");
    expect(declarations('.workspace-tab[data-drop-shift="right"]')).toContain("transform:translate3d(calc(var(--workspace-tab-width) + 3px),0,0)");
    expect(declarations(".workspace-tab.drop-target::after")).toContain("border:1px solid var(--workspace-tab-active-border)");
    expect(declarations('.workspace-tab.drop-target[data-drop-shift="left"]::after')).toContain("left:calc(100% + 3px)");
    expect(declarations('.workspace-tab.drop-target[data-drop-shift="right"]::after')).toContain("right:calc(100% + 3px)");
    expect(declarations(".workspace-tab-strip.dragging .workspace-tab-selection")).toContain("opacity:0");
    expect(declarations(".workspace-tab-strip.drop-settling .workspace-tab")).toContain("transition:none");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.workspace-tab:not\(\.dragging\)\{transition-property:opacity,color,background-color,border-color!important\}/);
    expect(styles).not.toMatch(/prefers-reduced-motion:reduce[\s\S]*\.workspace-tab\[data-drop-shift\]\{transform:none\}/);
  });

  it("slides workspace content in the tab direction with a reduced-motion fade", () => {
    expect(declarations(".workspace-canvas-stage.visible.workspace-transition-forward")).toContain("animation:workspace-stage-forward 220ms cubic-bezier(.2,.8,.2,1)");
    expect(declarations(".workspace-canvas-stage.visible.workspace-transition-backward")).toContain("animation:workspace-stage-backward 220ms cubic-bezier(.2,.8,.2,1)");
    expect(styles).toContain("@keyframes workspace-stage-forward{from{opacity:.5;transform:translate3d(8px,0,0)}");
    expect(styles).toContain("@keyframes workspace-stage-backward{from{opacity:.5;transform:translate3d(-8px,0,0)}");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.workspace-canvas-stage\.visible\.workspace-transition-forward,[\s\S]*animation:workspace-stage-fade 100ms ease-out!important/);
  });

  it("uses native window material behind a lightly tinted, rounded webview shell", () => {
    const root = declarations(":root");
    const appShell = declarations(".app-shell");
    const windowsShell = declarations('.app-shell[data-platform="windows"]');
    const chrome = declarations(".app-chrome");
    const utilityRail = declarations(".utility-rail");
    const workspaceCanvas = declarations(".workspace-canvas");
    const terminalBlock = declarations(".terminal-block");
    const terminalHeader = declarations(".terminal-block-header");
    const activeTerminalHeader = declarations(".terminal-block.active>.terminal-block-header");
    const dialog = declarations(".dialog-frame");
    const window = tauriConfig.app.windows[0];

    expect(root).toContain("--workbench-panel:rgba(5,7,8,.92)");
    expect(appShell).toContain("border-radius:var(--shell-radius)");
    expect(appShell).toContain("background:var(--shell-material)");
    expect(appShell).not.toContain("border:");
    expect(appShell).not.toContain("isolation:isolate");
    expect(windowsShell).toContain("border-radius:0");
    expect(windowsShell).toContain("box-shadow:none");
    expect(chrome).not.toContain("backdrop-filter:");
    expect(utilityRail).not.toContain("backdrop-filter:");
    expect(chrome).toContain("background:var(--chrome-material)");
    expect(utilityRail).toContain("background:var(--rail-material)");
    expect(workspaceCanvas).toContain("background:var(--workspace-material)");
    expect(terminalBlock).toContain("background:var(--workbench-panel)");
    expect(terminalHeader).toContain("background:var(--block-header-background)");
    expect(activeTerminalHeader).toContain("background:var(--block-header-active-background)");
    expect(terminalHeader).not.toContain("backdrop-filter:");
    expect(dialog).toContain("backdrop-filter:blur(30px)");
    expect(dialog).toContain("background:var(--floating-material)");
    expect(window.theme).toBe("Dark");
    expect(window.transparent).toBe(true);
    expect(window.shadow).toBe(true);
    expect(window.windowEffects).toEqual({
      effects: ["hudWindow", "mica", "acrylic", "blur"],
    });
    expect(lightOverrides).toMatch(/:root\[data-theme="light"\] body,\s*:root\[data-theme="light"\] #root\s*\{[^}]*background:transparent/);
    expect(lightOverrides).not.toMatch(/:root\[data-theme="light"\] \.app-shell\s*\{/);
    expect(styles).toMatch(/prefers-reduced-transparency:reduce[\s\S]*\.app-shell,\.workspace-canvas\{background:var\(--canvas\)\}/);
    expect(styles).toMatch(/prefers-reduced-transparency:reduce[\s\S]*\.terminal-block,\.terminal-surface,\.file-browser,\.network-pane\{background:var\(--surface\)\}/);
    expect(styles).toMatch(/prefers-contrast:more[\s\S]*\.app-shell\{background:var\(--canvas\);box-shadow:inset 0 0 0 1px var\(--border\)\}/);
    expect(styles).toMatch(/prefers-contrast:more[\s\S]*\.terminal-block,\.terminal-surface,\.file-browser,\.network-pane\{background:var\(--surface\)\}/);
  });

  it("keeps the repository picker wider than the later shared dialog default", () => {
    const repositoryPicker = declarations(".dialog-frame.git-repository-picker-dialog");

    expect(repositoryPicker).toContain("width: min(925px, calc(100vw - 48px))");
    expect(repositoryPicker).toContain("height: min(470px, calc(100vh - 48px))");
    expect(declarations(".dialog-frame")).toContain("width:min(540px,calc(100vw - 48px))");
  });

  it("places the macOS traffic lights and brand on one tab-height glass plaque", () => {
    const brand = declarations('.app-shell[data-platform="macos"] .app-brand');
    const brandPlate = declarations('.app-shell[data-platform="macos"] .app-brand::before');
    const brandIcon = declarations('.app-shell[data-platform="macos"] .app-brand svg');
    const brandLabel = declarations('.app-shell[data-platform="macos"] .app-brand span');
    const macosWindow = macosTauriConfig.app.windows[0];

    expect(macosWindow.decorations).toBe(true);
    expect(macosWindow.titleBarStyle).toBe("Overlay");
    expect(macosWindow.trafficLightPosition).toEqual({ x: 14, y: 18 });
    expect(macosWindow.windowEffects).toEqual({
      effects: ["hudWindow", "mica", "acrylic", "blur"],
      state: "followsWindowActiveState",
      radius: 12,
    });
    expect(brand).toContain("height:30px");
    expect(brand).not.toContain("transition:");
    expect(brandPlate).toContain("inset:0 0 0 -80px");
    expect(brandPlate).toContain("border-radius:7px");
    expect(brandPlate).toContain("border:1px solid var(--brand-plate-border)");
    expect(brandPlate).toContain("background:var(--brand-plate-background)");
    expect(brandPlate).toContain("box-shadow:var(--brand-plate-shadow)");
    expect(brandPlate).toContain("backdrop-filter:blur(8px) saturate(115%)");
    expect(brandPlate).toContain('content:""');
    expect(brand).toContain("gap:6px");
    expect(brandIcon).toContain("width:14px");
    expect(brandIcon).toContain("color-mix(in srgb,var(--signature) 72%,var(--muted))");
    expect(brandLabel).toContain("font-size:12px");
    expect(brandLabel).toContain("font-weight:600");
    expect(brandLabel).toContain("color:var(--muted)");
    expect(styles).toMatch(/prefers-reduced-transparency:reduce[\s\S]*\.app-chrome,\.app-shell\[data-platform="macos"\] \.app-brand::before,\.utility-rail\{background:var\(--chrome\)\}/);
    expect(styles).toMatch(/prefers-contrast:more[\s\S]*\.app-shell\[data-platform="macos"\] \.app-brand::before\{border-color:var\(--border\)/);
  });

  it("fills tall terminal blocks with one continuous terminal surface", () => {
    const terminalSurface = declarations(".terminal-surface");
    const xtermSurface = declarations(".terminal-surface>.xterm");
    const xtermViewport = declarations(".terminal-surface .xterm-viewport");

    expect(terminalSurface).toContain("min-height:0");
    expect(terminalSurface).toContain("flex:1");
    expect(terminalSurface).not.toContain("padding:");
    expect(declarations(".terminal-surface,.file-browser,.network-pane")).toContain("background:transparent");
    expect(xtermSurface).toContain("height:100%");
    expect(xtermSurface).toContain("padding:4px 3px 2px 7px");
    expect(xtermViewport).toContain("background-color:transparent");
  });

  it("uses one dark translucent surface language across terminal, files, and network blocks", () => {
    const block = declarations(".terminal-block");
    const contentSurfaces = declarations(".terminal-surface,.file-browser,.network-pane");

    expect(block).toContain("background:var(--workbench-panel)");
    expect(block).toContain("overflow:hidden");
    expect(block).not.toContain("backdrop-filter:");
    expect(block).not.toContain("-webkit-backdrop-filter:");
    expect(contentSurfaces).toContain("background:transparent");
    expect(declarations(".network-block")).not.toContain("background:");
    expect(declarations(".file-browser-navigation")).toContain("height:34px");
    expect(declarations(".network-toolbar")).toContain("height:34px");
    expect(declarations(".file-browser-navigation")).toContain("background:var(--file-browser-chrome-background)");
    expect(declarations(".network-toolbar")).toContain("background:var(--block-header-background)");
    expect(declarations(".file-browser-columns")).toContain("background:var(--file-browser-chrome-background)");
    expect(declarations(".file-browser-columns")).toContain("backdrop-filter:blur(8px)");
    expect(declarations(".file-browser-statusbar")).toContain("background:var(--panel-bg)");
    expect(declarations(".network-create-button")).toContain("width:25px");
    expect(declarations(".network-create-button")).toContain("height:25px");
    expect(declarations(".network-create-button")).toContain("border:0");
    expect(declarations(".network-create-button")).toContain("background:transparent");
    expect(declarations(".network-create-button")).not.toContain("box-shadow:");
    expect(declarations(".network-rule-item.with-access-label")).toContain("grid-template-columns:6px minmax(0,1fr) 48px 38px");
    expect(declarations(".network-rule-item")).toContain("min-height:58px");
    expect(declarations(".network-rule-item+.network-rule-item")).toContain("margin-top:3px");
    expect(declarations(".network-rule-copy")).toContain("flex-direction:column");
    expect(declarations('.network-rule-item[data-state="running"] .network-rule-route-highlight')).toContain("animation:network-route-character-flow 6.4s");
    expect(declarations(".network-rule-route-highlight")).toContain("mask-image:linear-gradient");
    expect(styles).toContain("@keyframes network-route-character-flow");
    expect(styles).not.toContain("network-route-content-flow");
    expect(styles).not.toContain("mix-blend-mode:screen");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.network-rule-route-highlight\{animation:none!important;opacity:0!important\}/);
    expect(declarations(".network-rule-list.empty")).toContain("display:flex");
    expect(declarations(".network-rule-list.empty>.network-empty")).toContain("width:100%");
    expect(declarations(".network-rule-list.empty>.network-empty")).toContain("flex:1");
    expect(declarations(".network-rule-switch")).toContain("width:38px");
    expect(declarations(".network-rule-switch")).toContain("height:18px");
    expect(declarations(".network-rule-switch-input")).toContain("opacity:0");
    expect(declarations(".network-rule-switch-label.off")).toContain("opacity:1");
    expect(declarations(".network-rule-switch-input:checked+.network-rule-switch-track .network-rule-switch-label.on")).toContain("opacity:1");
    expect(declarations(".network-rule-switch-input:checked+.network-rule-switch-track .network-rule-switch-thumb")).toContain("translateX(20px)");
    expect(declarations(".network-rule-access-button.labeled")).toContain("width:48px");
    expect(declarations(".network-rule-access-button.labeled")).toContain("display:flex");
    expect(declarations(".network-rule-access-button")).toContain("background:transparent");
    expect(declarations(".network-rule-access-button:focus-visible")).toContain("outline:2px solid var(--focus)");
    expect(declarations(".network-access-description")).toContain("background:#121a18");
    expect(declarations(".network-access-description")).toContain("align-items:center");
    expect(declarations(".network-access-description svg")).not.toContain("margin-top");
    expect(styles).not.toContain(".network-rule-menu-hint");
    expect(declarations(".network-context-menu")).toContain("position:fixed");
    expect(declarations(".dialog-frame.network-type-dialog")).toContain("width:min(660px,calc(100vw - 40px))");
    expect(declarations(".network-type-options")).toContain("grid-template-columns:repeat(3,minmax(0,1fr))");
    expect(declarations(".network-type-option")).toContain("min-height:150px");
    expect(declarations(".network-type-option:focus-visible")).toContain("outline:2px solid var(--focus)");
    expect(declarations(".network-type-route")).toContain("height:16px");
    expect(declarations(".network-type-route-endpoint svg")).toContain("flex:none");
    expect(declarations(".network-type-route-endpoint>span")).toContain("font-size:8px");
    expect(declarations(".network-rule-flow-route")).toContain("grid-template-columns:auto minmax(28px,1fr) auto minmax(28px,1fr) auto");
    expect(declarations(".network-rule-flow-route")).toContain("column-gap:6px");
    expect(declarations(".network-rule-flow-node")).toContain("min-width:0");
    expect(declarations(".network-rule-flow-node")).toContain("width:max-content");
    expect(declarations(".network-rule-flow-node")).toContain("max-width:145px");
    expect(declarations(".network-rule-flow-node code")).toContain("text-overflow:ellipsis");
    expect(declarations(".network-rule-field-label svg")).toContain("flex:none");
    expect(declarations(".network-rule-flow-connector::before")).toContain("height:1px");
    expect(declarations(".network-rule-flow-connector::after")).toContain("animation:network-rule-flow-packet 1.8s");
    expect(declarations(".network-rule-flow-connector::after")).toContain("transform:translateX(-100%)");
    expect(styles).toContain("@keyframes network-rule-flow-packet");
    expect(declarations(".network-access-dialog")).toContain("width:min(500px,calc(100vw - 40px))");
    expect(declarations(".network-access-dialog .dialog-content")).toContain("overflow:auto");
    expect(declarations(".network-access-field>div")).toContain("grid-template-columns:minmax(0,1fr) 30px");
    expect(declarations(".network-access-browser-grid")).toContain("grid-template-columns:1fr 1fr");
    expect(declarations(".network-access-proxy-option")).toContain("min-height:58px");
    expect(lastDeclarations(".network-access-option-switch")).toContain("position:relative");
    expect(lastDeclarations(".network-access-option-switch")).toContain("display:block");
    expect(lastDeclarations(".network-access-option-switch")).toContain("padding:0");
    expect(lastDeclarations(".network-access-option-switch")).toContain("line-height:0");
    expect(lastDeclarations(".network-access-option-switch>span")).toContain("position:absolute");
    expect(lastDeclarations(".network-access-option-switch>span")).toContain("top:2px");
    expect(lastDeclarations(".network-access-option-switch>span")).toContain("left:2px");
    expect(lastDeclarations(".network-access-option-switch>span")).toContain("transition:transform 180ms");
    expect(lastDeclarations('.network-access-option-switch[aria-checked="true"]>span')).toContain("transform:translateX(14px)");
    expect(declarations(".network-access-option-switch:focus-visible")).toContain("outline:2px solid var(--focus)");
    expect(declarations('.network-access-browser-grid>button[data-state="unavailable"]')).toContain("opacity:.68");
    expect(declarations('.network-access-browser-grid>button[data-state="waiting"]:disabled')).toContain("border-color:#3b514b");
    expect(declarations('.network-access-browser-grid>button[data-state="waiting"]:disabled .network-access-browser-icon')).toContain("color:#7fc5b8");
    expect(declarations(".network-access-dialog>.dialog-content")).toContain("padding:14px 18px 11px");
    expect(declarations(".network-access-content-compact")).toContain("gap:9px");
    expect(declarations(".network-access-footer")).toContain("grid-template-areas:\"message\"");
    expect(declarations(".network-access-footer-note,.network-access-footer-status")).toContain("justify-content:center");
    expect(declarations(".network-access-footer-note,.network-access-footer-status")).toContain("text-align:center");
    expect(declarations(".network-access-footer.has-message .network-access-footer-note")).toContain("opacity:0");
    expect(declarations(".network-access-footer>.network-access-footer-status")).toContain("opacity:0");
    expect(declarations(".network-access-footer>.network-access-footer-status")).toContain("white-space:nowrap");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.network-rule-flow-connector::after\{animation:none!important/);
    expect(styles).toMatch(/max-width:620px[\s\S]*\.network-type-options\{grid-template-columns:1fr\}/);
    expect(styles).toMatch(/prefers-reduced-transparency:reduce[\s\S]*\.terminal-block,.terminal-surface,.file-browser,.network-pane\{background:var\(--surface\)\}/);
  });

  it("gives dialogs short spatial entry motion while keeping resting controls pixel-aligned", () => {
    expect(styles).toContain("@keyframes dialog-in{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.dialog-frame\{transform:none\}/);
    expect(lastDeclarations(".settings-nav-item")).toContain("grid-template-columns:28px minmax(0,1fr)");
    expect(lastDeclarations(".settings-nav-item:active")).toContain("transform:none");
    expect(lastDeclarations(".settings-nav-icon")).toContain("position:relative");
    expect(lastDeclarations(".settings-nav-icon")).toContain("width:28px");
    expect(lastDeclarations(".settings-nav-icon")).toContain("height:28px");
    expect(declarations(".settings-nav-icon>svg")).toContain("position:absolute");
    expect(declarations(".settings-nav-icon>svg")).toContain("inset:0");
    expect(declarations(".settings-nav-icon>svg")).toContain("margin:auto");
  });

  it("keeps canvas and split gutters compact", () => {
    expect(declarations(".workspace-canvas")).toContain("padding:5px");
    expect(styles).not.toContain(".terminal-block.maximized");
    expect(styles).not.toContain(".terminal-block.hidden-by-maximize");
    expect(declarations(".workspace-layout-surface")).toContain("inset:5px");
    expect(declarations(".workspace-block-host")).toContain("position:absolute");
    expect(declarations(".split-divider")).toContain("position:absolute");
    expect(declarations(".split-divider-horizontal")).toContain("cursor:col-resize");
    expect(declarations(".split-divider-vertical")).toContain("cursor:row-resize");
  });

  it("uses one moving outer outline while keeping active block content obvious", () => {
    const canvas = declarations(".workspace-canvas");
    const block = declarations(".terminal-block");
    const activeBlock = declarations(".terminal-block.active");
    const activeHeader = declarations(".terminal-block.active>.terminal-block-header");
    const indicator = declarations(".active-block-indicator");
    const movingIndicator = declarations(".active-block-indicator.ready");

    expect(canvas).toContain("--workspace-block-radius:9px");
    expect(block).toContain("border-radius:var(--workspace-block-radius)");
    expect(activeBlock).not.toContain("border-color");
    expect(activeBlock).not.toContain("box-shadow");
    expect(styles).not.toMatch(/\.terminal-block\.active\s*\{[^}]*border-color/);
    expect(styles).not.toMatch(/\.terminal-block\.active\s*\{[^}]*box-shadow/);
    expect(activeHeader).toContain("background:var(--block-header-active-background)");
    expect(indicator).toContain("pointer-events:none");
    expect(indicator).toContain("border-radius:var(--workspace-block-radius)");
    expect(indicator).toContain("border:1px solid var(--block-border-active)");
    expect(indicator).toContain("box-shadow:var(--block-active-indicator-shadow)");
    expect(movingIndicator).toContain("transition:left 300ms");
    expect(movingIndicator).toContain("top 300ms");
    expect(movingIndicator).not.toContain("transition:transform");
    expect(styles).toContain("@media (prefers-reduced-motion:reduce)");
    expect(styles).toContain(".active-block-indicator.ready{transition:none}");
  });

  it("keeps the selected workspace tab above one theme-owned moving surface", () => {
    const selection = declarations(".workspace-tab-selection");
    expect(selection).toContain("border:1px solid var(--workspace-tab-active-border)");
    expect(selection).toContain("background:var(--workspace-tab-active-background)");
    expect(selection).toContain("box-shadow:var(--workspace-tab-active-shadow)");
    expect(declarations(".workspace-tab.selected")).toContain("color:var(--workspace-tab-active-text)");
    expect(declarations(".workspace-tab.selected .workspace-tab-select svg")).toContain("color:var(--accent)");
    expect(declarations(".workspace-tab:hover:not(.selected)")).toContain("border-color:var(--workspace-tab-hover-border)");
    expect(declarations(".workspace-tab:hover:not(.selected)")).toContain("background:var(--workspace-tab-hover-background)");
    expect(lightOverrides).not.toMatch(/\.workspace-tab:hover:not\(\.selected\)/);
    expect(lightOverrides).not.toMatch(/\.workspace-tab\.selected/);
    expect(lightOverrides).not.toContain(".workspace-tab.active");
    expect(lightOverrides).not.toContain(".workspace-tab[data-active]");
  });

  it("uses shared theme-aware compact icon buttons for workspace close and create actions", () => {
    const iconButton = declarations(".icon-button");
    const quietHover = declarations(".icon-button:hover:not(:disabled)");

    expect(workspaceShellSource).toContain('className="workspace-tab-close"');
    expect(workspaceShellSource).toContain('className="new-workspace-tab"');
    expect(workspaceShellSource.match(/<IconButton/g)).toHaveLength(2);
    expect(iconButton).toContain("color:var(--icon)");
    expect(iconButton).toContain("background:transparent");
    expect(quietHover).toContain("color:var(--icon-hover)");
    expect(quietHover).toContain("background:var(--control-hover)");
    expect(declarations(".ui-icon-button:active:not(:disabled)")).toContain("transform:scale(.97)");
    expect(styles).toMatch(/\.ui-button:focus-visible,\s*\.ui-icon-button:focus-visible,[^{]+\{\s*outline:2px solid var\(--focus\)/);
    expect(declarations(".workspace-tab-close")).toContain("position:absolute");
    expect(declarations(".workspace-tab-close")).toContain("top:1px");
    expect(declarations(".new-workspace-tab")).toContain("margin-left:2px");
    expect(declarations(".new-workspace-tab.ui-icon-button:hover:not(:disabled)")).toContain("background:var(--chrome-action-hover)");
    expect(declarations(".new-workspace-tab.ui-icon-button:active:not(:disabled)")).toContain("background:var(--chrome-action-pressed)");
    expect(declarations(".workspace-tab-close.ui-icon-button:hover:not(:disabled)")).toContain("color:var(--danger)");
    expect(declarations(".workspace-tab-close.ui-icon-button:hover:not(:disabled)")).toContain("background:var(--danger-bg)");
    expect(declarations(".window-controls")).toContain("gap:2px");
    expect(declarations(".window-controls")).toContain("padding:0 4px");
    expect(declarations(".window-controls button")).toContain("width:38px");
    expect(declarations(".window-controls button")).toContain("height:30px");
    expect(declarations(".window-controls button")).toContain("border-radius:5px");
    expect(declarations('.window-controls button:not(.window-close):not(.window-pin[aria-pressed="true"]):hover')).toContain("background:var(--chrome-action-hover)");
    expect(declarations('.window-controls button:not(.window-close):not(.window-pin[aria-pressed="true"]):active')).toContain("background:var(--chrome-action-pressed)");
    expect(declarations(".window-controls .window-close:hover")).toContain("var(--danger)");
    expect(lightOverrides).not.toMatch(/workspace-tab-close|new-workspace-tab/);
  });

  it("keeps theme selection theme-owned without painting an unselected status marker", () => {
    const option = declarations(".settings-theme-option");
    const selected = declarations(".settings-theme-option[data-selected]");

    expect(option).toContain("background:var(--surface)");
    expect(selected).toContain("border-color:var(--selection-marker)");
    expect(selected).toContain("color:var(--text)");
    expect(selected).toContain("background:var(--selection-surface)");
    expect(lightOverrides).not.toContain(".settings-theme-option");
  });

  it("anchors workbench failures without covering the block header", () => {
    const notice = declarations(".block-notice");
    expect(notice).toContain("position:absolute");
    expect(notice).toContain("right:8px");
    expect(notice).toContain("bottom:8px");
    expect(notice).toContain("box-sizing:border-box");
    expect(notice).toContain("width:calc(100% - 16px)");
    expect(notice).toContain("max-height:min(160px,40%)");
    expect(notice).toContain("overflow-y:auto");
    expect(notice).toContain("overflow-wrap:anywhere");
    expect(notice).toContain("word-break:break-word");
    expect(notice).toContain("color:var(--danger)");
    expect(notice).toContain("var(--danger-bg)");
    expect(notice).toContain("var(--shadow-strong)");
  });

  it("keeps terminal and files block actions visible without hover", () => {
    expect(declarations(".block-actions")).toContain("opacity:1");
    expect(declarations(".terminal-header-close")).toContain("flex:none");
    expect(declarations(".terminal-header-menu")).toContain("position:fixed");
    expect(declarations(".terminal-header-menu")).toContain("z-index:120");
    expect(styles).not.toContain(".terminal-block:hover .block-actions,.terminal-block.active .block-actions");
    expect(declarations('.block-actions button[aria-label^="关闭"]:hover')).toContain("color:var(--danger)");
    expect(declarations('.block-actions button[aria-label^="关闭"]:hover')).toContain("background:var(--danger-bg)");
  });

  it("keeps the labeled utility rail compact and visually secondary", () => {
    expect(declarations(".workspace-stage-content")).toContain("grid-template-columns:minmax(0,1fr) 62px");
    expect(declarations(".rail-button")).toContain("grid-template-rows:18px auto");
    expect(declarations(".rail-button-label")).toContain("font-size:8px");
    expect(declarations(".rail-button")).toContain("color:var(--icon)");
    expect(declarations(".rail-button-label")).toContain("color:var(--muted)");
    expect(declarations(".rail-button.active")).toContain("color:var(--navigation-accent)");
    expect(declarations(".rail-button.active")).toContain("background:var(--navigation-accent-bg)");
    const updateAttention = declarations(".rail-button.update-attention:not(.active)");
    expect(updateAttention).toContain("color:var(--navigation-accent)");
    expect(updateAttention).not.toContain("background:");
    expect(updateAttention).not.toContain("border-color:");
    expect(updateAttention).not.toContain("animation:");
    expect(declarations(".rail-button.update-attention:not(.active)>svg")).toContain("animation:rail-update-icon-attention 1.25s ease-in-out 4");
    expect(declarations(".rail-button.update-attention:not(.active)>.rail-button-label")).toContain("animation:rail-update-label-attention 1.25s ease-in-out 4");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.rail-button\.update-attention:not\(\.active\)>svg,[\s\S]*animation:none/);
    expect(styles).not.toContain(".rail-update-notice");
  });

  it("uses a sliding segmented connection tab with directional, reduced-motion-aware content transitions", () => {
    expect(declarations(".dialog-actions.connection-editor-actions")).toContain("justify-content:space-between");
    expect(declarations(".connection-editor-tabs")).toContain("grid-template-columns:repeat(3,1fr)");
    expect(declarations(".connection-editor-tab-indicator")).toContain("transition:transform 260ms");
    expect(declarations('.connection-editor-tabs[data-active="authentication"] .connection-editor-tab-indicator')).toContain("translateX(100%)");
    expect(declarations('.connection-editor-tabs[data-active="jump"] .connection-editor-tab-indicator')).toContain("translateX(200%)");
    expect(declarations(".jump-route-panel")).toContain("overflow:auto");
    expect(declarations(".jump-route-flow-node")).toContain("min-width:0");
    expect(declarations(".jump-route-row-control")).toContain("grid-template-columns:minmax(0,1fr)");
    expect(declarations(".jump-route-row-control.has-remove")).toContain("grid-template-columns:minmax(0,1fr) 38px");
    expect(declarations(".jump-route-remove")).toContain("width:38px");
    expect(declarations(".jump-route-remove")).toContain("height:38px");
    expect(declarations(".jump-route-remove")).toContain("color:#ff9b98");
    expect(declarations(".jump-route-add")).toContain("width:100%");
    expect(declarations(".jump-route-add")).toContain("border:1px dashed var(--subtle)");
    expect(declarations(".jump-profile-picker-dialog .dialog-content")).toContain("overflow:hidden");
    expect(declarations(".jump-picker-list")).toContain("overflow:auto");
    expect(declarations(".jump-picker-option")).toContain("grid-template-columns:28px minmax(0,1fr) minmax(95px,auto)");
    expect(declarations(".connection-storage-warning")).toContain("min-width:0");
    expect(declarations(".connection-storage-warning-message")).toContain("text-overflow:ellipsis");
    expect(declarations(".connection-storage-clear")).toContain("height:27px");
    expect(declarations(".connection-storage-clear")).toContain("gap:5px");
    expect(declarations(".connection-editor-tabs button>span")).toContain("transition:");
    expect(declarations(".connection-tab-panel.tab-forward")).toContain("animation:connection-tab-forward");
    expect(declarations(".connection-tab-panel.tab-backward")).toContain("animation:connection-tab-backward");
    expect(styles).toContain("@keyframes connection-tab-forward");
    expect(styles).toContain("@keyframes connection-tab-backward");
    expect(styles).toContain(".connection-tab-panel{transform:none!important;animation:connection-tab-fade");
  });

  it("allocates the full credential dialog height to its two-pane layout", () => {
    expect(declarations(".credential-dialog .dialog-content")).toContain("flex:1");
    expect(declarations(".credential-dialog .dialog-content")).toContain("overflow:hidden");
    expect(declarations(".credential-dialog-grid")).toContain("width:100%");
    expect(declarations(".credential-dialog-grid")).toContain("min-height:0");
    expect(declarations(".credential-list")).toContain("overflow:auto");
    expect(declarations(".credential-editor-stage")).toContain("flex:1");
    expect(declarations(".credential-editor-stage.credential-detail-stage")).toContain("overflow:hidden");
    expect(declarations(".credential-public-key")).toContain("flex:1");
    expect(declarations(".credential-public-key")).toContain("min-height:0");
    expect(declarations(".credential-public-key textarea")).toContain("flex:1");
    expect(declarations(".credential-public-key textarea")).toContain("padding:10px 12px");
    expect(declarations(".credential-public-key textarea")).toContain("overflow:auto");
    expect(declarations(".credential-public-key-actions")).toContain("display:flex");
    expect(declarations(".credential-public-key-actions")).toContain("gap:3px");
    expect(declarations(".credential-public-key-action")).toContain("width:25px");
    expect(declarations(".credential-public-key-action")).toContain("height:25px");
    expect(declarations(".credential-private-key-create")).toContain("grid-template-rows:auto minmax(0,1fr)");
    expect(declarations(".credential-private-key-actions")).toContain("grid-template-rows:repeat(2,minmax(64px,1fr))");
    expect(declarations(".credential-private-key-dropzone")).toContain("border:1px dashed");
    expect(declarations(".credential-private-key-dropzone,.credential-private-key-generate")).toContain("width:100%");
    expect(declarations(".credential-private-key-dropzone,.credential-private-key-generate")).toContain("min-height:64px");
    expect(declarations(".credential-private-key-dropzone,.credential-private-key-generate")).toContain("justify-content:center");
    expect(declarations(".credential-private-key-dropzone.selected,.credential-private-key-generate.selected")).toContain("border-color:#4f8177");
    expect(declarations(".credential-private-key-validation")).toContain("flex:1");
    expect(declarations(".credential-private-key-footer .ui-button")).toContain("flex:none");
    expect(declarations(".credential-name-line")).toContain("min-width:0");
    expect(declarations(".credential-name-line>strong")).toContain("text-overflow:ellipsis");
    expect(declarations(".credential-editor-heading .credential-name-line")).toContain("height:25px");
    expect(declarations(".credential-editor-heading .credential-name-line")).toContain("flex:none");
    expect(declarations(".credential-editor-heading>div")).toContain("width:0");
    expect(declarations(".credential-editor-heading>div")).toContain("flex:1");
    expect(declarations(".credential-editor-heading>div")).toContain("grid-template-rows:25px minmax(13px,auto)");
    expect(declarations(".credential-name-editor")).toContain("position:relative");
    expect(declarations(".credential-name-editor")).toContain("flex:1");
    expect(declarations(".credential-name-line.editing .credential-name-editor::before")).toContain("inset:0 -4px");
    expect(declarations(".credential-name-line.editing .credential-name-editor::before")).toContain("border-radius:6px");
    expect(declarations(".credential-name-line.editing .credential-name-editor::before")).toContain("pointer-events:none");
    expect(declarations(".credential-name-line.editing .credential-name-editor:focus-within::before")).toContain("border-color:#527c73");
    expect(declarations(".credential-name-editor>strong")).toContain("flex:1");
    expect(declarations(".credential-name-editor input")).toContain("min-width:0");
    expect(declarations(".credential-name-editor input")).toContain("height:20px");
    expect(declarations(".credential-name-editor input")).toContain("border:0");
    expect(declarations(".credential-name-editor input")).toContain("background:transparent");
    expect(declarations(".credential-name-editor input")).toContain("box-shadow:none");
    expect(declarations(".credential-name-editor input")).toContain("caret-color:var(--accent)");
    expect(declarations(".credential-name-editor input::selection")).toContain("background:#315e56");
    expect(declarations(".credential-name-editor input:focus,.credential-name-editor input:focus-visible")).toContain("outline:0");
    expect(declarations(".credential-name-action")).toContain("flex:none");
    expect(declarations(".credential-name-action.reserved")).toContain("visibility:hidden");
    expect(declarations(".credential-security-tag")).toContain("border-radius:999px");
    expect(declarations(".credential-security-tag")).toContain("flex:none");
    expect(declarations(".credential-security-tooltip")).toContain("position:fixed");
    expect(declarations(".credential-security-tooltip")).toContain("pointer-events:none");
    expect(declarations('.credential-security-tooltip[data-placement="above"]')).toContain("--credential-security-tooltip-enter-y:-3px");
    expect(declarations(".credential-feedback-bubble")).toContain("position:fixed");
    expect(declarations(".credential-feedback-bubble")).toContain("pointer-events:none");
    expect(declarations(".credential-feedback-bubble")).toContain("var(--navigation-accent)");
    expect(declarations(".credential-feedback-bubble::before")).toContain("var(--navigation-accent)");
    expect(declarations(".credential-feedback-bubble.error")).toContain("var(--danger)");
    expect(declarations(".credential-item:hover")).toMatch(/border-color:transparent;\s*background:var\(--hover\)/);
    expect(styles).toContain(".credential-dialog .ui-button--secondary:hover:not(:disabled)");
    expect(styles).toContain("color:var(--navigation-accent);background:var(--navigation-accent-bg)");
    expect(styles).not.toContain(".credential-message");
  });

  it("keeps the quick authentication dialog wider and stable across methods", () => {
    expect(declarations(".dialog-frame.connection-auth-dialog")).toContain("width:min(470px");
    expect(declarations(".dialog-frame.connection-auth-dialog")).toContain("height:min(390px");
    expect(declarations(".connection-auth-dialog .dialog-content")).toContain("overflow:hidden");
    expect(declarations(".connection-auth-form")).toContain("height:100%");
    expect(declarations(".connection-auth-form")).toContain("grid-template-rows:auto minmax(0,1fr) auto");
    expect(declarations(".auth-dialog-actions")).toContain("justify-content:space-between");
    expect(declarations(".auth-dialog-action-note")).toContain("white-space:nowrap");
    expect(declarations(".auth-dialog-action-note")).toContain("text-overflow:ellipsis");
    expect(declarations(".auth-method-content")).toContain("overflow:auto");
    expect(declarations(".auth-security-hint")).not.toContain("background:");
    expect(declarations(".auth-password-field input")).toContain("caret-color:var(--focus)");
    const passwordFocus = declarations(".auth-password-field input:focus,.auth-password-field input:focus-visible");
    expect(passwordFocus).toContain("outline:2px solid var(--focus)");
    expect(passwordFocus).toContain("outline-offset:-2px");
    expect(passwordFocus).toContain("box-shadow:none");
    expect(passwordFocus).toContain("background:color-mix(in srgb,var(--control-bg) 92%,var(--focus))");
    expect(declarations(".auth-method-indicator")).toContain("transition:transform 260ms");
    expect(declarations(".segmented.auth-method-picker button.selected")).toContain("box-shadow:none");
    expect(declarations('.auth-method-picker[data-active="credential"] .auth-method-indicator')).toContain("translateX(100%)");
    expect(declarations('.auth-method-picker[data-active="sshAgent"] .auth-method-indicator')).toContain("translateX(200%)");
    expect(declarations(".auth-method-panel.auth-forward")).toContain("animation:auth-content-forward");
    expect(declarations(".auth-method-panel.auth-backward")).toContain("animation:auth-content-backward");
    expect(styles).toContain(".auth-method-panel{transform:none!important;animation:auth-content-fade");
  });

  it("keeps connection rows dense and gives drag targets and context menus restrained feedback", () => {
    expect(declarations(".connection-sidebar-toolbar")).toContain("flex:none");
    expect(declarations(".connection-list")).toContain("overflow:auto");
    expect(declarations(".connection-item")).toContain("min-height:30px");
    expect(declarations(".connection-item")).toContain("grid-template-columns:15px minmax(0,1fr)");
    expect(declarations(".connection-item")).toContain("touch-action:none");
    expect(declarations(".connection-item-icon")).toContain("place-items:center");
    expect(lastDeclarations(".connection-item.selected .connection-item-icon")).toContain("color:var(--selection-marker)");
    expect(declarations(".connection-item-endpoint")).toContain("font-family:");
    expect(declarations(".connection-item-address")).toContain("text-overflow:ellipsis");
    expect(declarations(".connection-item-auth")).toContain("flex:none");
    expect(declarations(".connection-item.selected")).not.toContain("inset 2px 0");
    expect(declarations(".ui-status-badge")).toContain("min-height:26px");
    expect(declarations(".password-input-shell")).toContain("position:relative");
    expect(declarations(".password-visibility-button")).toContain("position:absolute");
    expect(declarations(".password-visibility-button")).toContain("width:24px");
    expect(declarations(".connection-group-section")).toContain("margin:0 0 5px");
    expect(declarations(".connection-group-heading")).toContain("background:#17191c");
    expect(declarations(".connection-group-heading")).toContain("border:1px solid #292d32");
    expect(declarations(".connection-group-toggle strong")).toContain("font-weight:700");
    expect(declarations(".connection-group-heading small")).toContain("border-radius:999px");
    expect(declarations(".connection-group-toggle:focus-visible")).toContain("outline:2px solid var(--focus)");
    expect(declarations(".connection-group-heading.drop-target")).toContain("border-color:#5cae9e");
    expect(declarations(".connection-context-menu")).toContain("position:fixed");
    expect(declarations(".connection-context-menu")).toContain("animation:connection-menu-in");
    expect(declarations(".connection-drag-preview")).toContain("position:fixed");
    expect(declarations(".connection-drag-preview")).toContain("pointer-events:none");
    expect(styles).toContain("@keyframes connection-menu-in");
    expect(styles).toContain(".connection-context-menu,.file-context-menu,.network-context-menu,.terminal-context-menu{animation:none}");
  });

  it("anchors connection save feedback to the button and disables spinner motion when requested", () => {
    expect(declarations(".connection-save-button")).toContain("position:relative");
    expect(declarations(".connection-save-button")).toContain("width:88px");
    expect(declarations(".connection-save-button")).toContain("height:30px");
    expect(declarations(".connection-save-button")).toContain("align-items:center");
    expect(declarations(".connection-save-content")).toContain("width:100%");
    expect(declarations(".connection-save-content")).toContain("align-items:center");
    expect(declarations(".connection-save-content>span:last-child")).toContain("line-height:1");
    expect(declarations(".connection-save-content>svg")).toContain("display:block");
    expect(declarations(".connection-save-spinner")).toContain("animation:connection-save-spin");
    expect(declarations(".connection-save-button.saving:disabled,.connection-save-button.success:disabled")).toContain("background:var(--primary-action)");
    expect(declarations(".connection-save-button.saving:disabled,.connection-save-button.success:disabled")).toContain("color:var(--primary-action-contrast)");
    expect(declarations(".connection-save-button.success .connection-save-content>svg")).toContain("animation:connection-save-success-icon-in");
    expect(declarations(".connection-save-feedback-bubble")).toContain("position:fixed");
    expect(declarations(".connection-save-feedback-bubble")).toContain("pointer-events:none");
    expect(declarations(".connection-save-feedback-bubble::before")).toContain("left:-5px");
    expect(styles).not.toContain(".connection-save-button.success { border-color:#4f9f8f");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.connection-save-spinner\{animation:none!important\}/);
  });

  it("keeps the terminal lock inside the workspace stage with opaque accessibility fallbacks", () => {
    expect(declarations(".dialog-scrim-blocking")).toContain("z-index:1000");
    expect(declarations(".dialog-scrim-blocking")).toContain("background:#020304e8");
    expect(declarations(".workspace-stage")).toContain("position:relative");
    expect(declarations(".workspace-stage-content")).toContain("grid-template-columns:minmax(0,1fr) 62px");
    expect(declarations(".terminal-lock-scrim")).toContain("position:absolute");
    expect(declarations(".terminal-lock-scrim")).toContain("inset:0");
    expect(declarations(".terminal-lock-options")).toContain("display:grid");
    expect(lastDeclarations(".terminal-lock-options>button:hover:not(:disabled),.terminal-lock-options>button:focus-visible")).toContain("background:var(--navigation-accent-bg)");
    expect(styles).toContain("color:var(--navigation-accent);background:var(--navigation-accent-bg)");
    expect(declarations(".terminal-lock-dialog")).toContain("background:#151917fa");
    expect(declarations(".dialog-action-status")).toContain("height:30px");
    expect(declarations(".dialog-action-status")).toContain("white-space:nowrap");
    expect(declarations(".dialog-action-status")).toContain("text-overflow:ellipsis");
    expect(styles).toContain(".dialog-scrim-blocking{background:var(--canvas)}");
  });

  it("keeps settings navigation fixed, scrolls only configuration content, and renders a real switch thumb", () => {
    expect(declarations(".settings-dialog")).toContain("height:min(");
    expect(declarations(".settings-dialog>.dialog-content")).toContain("flex:1");
    expect(declarations(".settings-layout")).toContain("grid-template-columns:176px minmax(0,1fr)");
    expect(declarations(".settings-layout")).toContain("min-height:0");
    expect(declarations(".settings-layout")).toContain("overflow:hidden");
    expect(declarations(".settings-content-scroll")).toContain("overflow:auto");
    expect(declarations(".settings-content-scroll")).toContain("padding:14px 18px");
    expect(declarations(".settings-general-stack")).toContain("display:grid");
    expect(declarations(".settings-directory-control")).toContain("grid-template-columns:minmax(0,1fr) auto");
    expect(declarations(".settings-directory-actions")).toContain("display:flex");
    expect(declarations(".settings-directory-actions .ui-button")).toContain("height:32px");
    expect(styles).toContain(".settings-directory-control input{height:32px;margin:0}");
    expect(declarations(".settings-general-view")).toContain("height:100%");
    expect(declarations(".settings-general-view")).toContain("min-height:0");
    expect(declarations(".settings-general-view .settings-general-stack")).toContain("flex:1");
    expect(declarations(".settings-general-view .settings-general-stack")).toContain("grid-template-rows:auto auto minmax(0,1fr)");
    expect(declarations(".settings-general-view .settings-path-list")).toContain("grid-template-rows:repeat(3,minmax(38px,1fr))");
    expect(declarations(".settings-path-row")).toContain("grid-template-columns:minmax(112px,.75fr) minmax(0,1.5fr)");
    expect(declarations(".settings-path-row")).toContain("min-height:38px");
    expect(declarations(".settings-path-row code")).toContain("font:");
    expect(declarations(".settings-feedback-slot")).toContain("height:30px");
    expect(declarations(".settings-actions")).toContain("min-height:49px");
    expect(declarations(".settings-storage-note")).toContain("justify-content:center");
    expect(declarations(".settings-storage-note")).toContain("text-align:center");
    expect(styles).toMatch(/@media \(max-width:700px\)\{[^\n]*\.settings-path-row\{grid-template-columns:minmax\(0,1fr\)/);
    expect(declarations(".settings-actions")).toContain("flex:none");
    expect(declarations(".settings-switch-input")).toContain("position:absolute");
    expect(declarations(".settings-switch-input")).toContain("opacity:0");
    expect(declarations(".settings-switch")).toContain("margin:0");
    expect(declarations(".settings-switch-input:checked+.settings-switch-track")).toContain("background:var(--accent-bg)");
    expect(declarations(".settings-switch-thumb")).toContain("border-radius:50%");
    expect(declarations(".settings-row .settings-timeout-control")).toContain("display:grid");
    expect(declarations(".settings-row .settings-timeout-control")).toContain("height:26px");
    expect(declarations(".settings-row .settings-timeout-control")).toContain("grid-template-columns:82px 34px");
    expect(declarations(".settings-row .settings-timeout-control select")).toContain("width:82px");
    expect(declarations(".settings-row .settings-timeout-control select")).toContain("height:26px");
    expect(declarations(".settings-row .settings-timeout-control select")).toContain("margin:0");
    expect(styles).not.toContain('.settings-row input[type="checkbox"]::after');
  });

  it("keeps file preview controls fixed and assigns scrolling to the editor or preview stage", () => {
    expect(declarations(".file-preview-toolbar")).toContain("flex:none");
    expect(declarations(".file-preview-content")).toContain("min-height:0");
    expect(declarations(".file-preview-content")).toContain("overflow:hidden");
    expect(declarations(".file-code-editor")).toContain("min-height:0");
    expect(declarations(".file-code-editor .cm-scroller")).toContain("overflow:auto");
    expect(declarations(".file-context-menu")).toContain("position:fixed");
    expect(declarations(".terminal-context-menu")).toContain("position:fixed");
    expect(declarations(".terminal-context-menu")).toContain("z-index:120");
    expect(declarations(".file-preview-toolbar .file-edit-button,.file-preview-toolbar .file-cancel-button,.file-preview-toolbar .file-save-button")).toContain("height:23px");
    expect(declarations(".file-preview-toolbar .file-edit-button,.file-preview-toolbar .file-cancel-button,.file-preview-toolbar .file-save-button")).toContain("display:flex");
    expect(styles).toContain(".file-preview-toolbar .file-save-button{width:48px}");
    expect(declarations(".file-code-editor:not([data-read-only]) .cm-cursor,.file-code-editor:not([data-read-only]) .cm-dropCursor")).toContain("border-left-color:var(--file-active-marker)");
    expect(declarations(".file-code-editor:not([data-read-only]) .cm-content")).toContain("caret-color:var(--file-active-marker)");
    expect(styles).toContain(".connection-context-menu,.file-context-menu,.network-context-menu,.terminal-context-menu{animation:none}");
  });

  it("centers file loading feedback in one themed compact popover", () => {
    expect(declarations(".file-loading-state")).toContain("display:grid");
    expect(declarations(".file-loading-state")).toContain("min-width:0");
    expect(declarations(".file-loading-state")).toContain("min-height:0");
    expect(declarations(".file-loading-state")).toContain("flex:1");
    expect(declarations(".file-loading-state")).toContain("place-items:center");
    expect(declarations(".file-loading-popover")).toContain("border:1px solid var(--floating-border)");
    expect(declarations(".file-loading-popover")).toContain("color:var(--text)");
    expect(declarations(".file-loading-popover")).toContain("background:var(--floating-material)");
    expect(declarations(".file-loading-popover")).toContain("box-shadow:var(--shadow-soft)");
    expect(declarations(".file-loading-spinner")).toContain("animation:file-loading-spin 700ms linear infinite");
    expect(styles).toContain("@keyframes file-loading-spin{to{transform:rotate(360deg)}}");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.file-loading-spinner\{animation:none\}/);
    expect(styles).toMatch(/prefers-reduced-transparency:reduce[\s\S]*\.file-loading-popover\{background:var\(--raised\);backdrop-filter:none/);
  });

  it("shares the file browser scrollbar treatment with every preview scroller", () => {
    const owners = ".file-browser-content,.file-code-editor .cm-scroller,.file-image-preview,.file-markdown-preview,.file-markdown-preview pre";
    expect(declarations(owners)).toContain("scrollbar-color:var(--scrollbar-thumb) transparent");
    expect(declarations(owners)).toContain("scrollbar-width:thin");
    const webkitOwners = ".file-browser-content::-webkit-scrollbar,.file-code-editor .cm-scroller::-webkit-scrollbar,.file-image-preview::-webkit-scrollbar,.file-markdown-preview::-webkit-scrollbar,.file-markdown-preview pre::-webkit-scrollbar";
    expect(declarations(webkitOwners)).toContain("width:5px");
    expect(declarations(webkitOwners)).toContain("height:5px");
    const thumbs = ".file-browser-content::-webkit-scrollbar-thumb,.file-code-editor .cm-scroller::-webkit-scrollbar-thumb,.file-image-preview::-webkit-scrollbar-thumb,.file-markdown-preview::-webkit-scrollbar-thumb,.file-markdown-preview pre::-webkit-scrollbar-thumb";
    expect(declarations(thumbs)).toContain("background:var(--scrollbar-thumb)");
    expect(declarations(thumbs)).toContain("border-radius:999px");
    expect(declarations(thumbs)).toContain("background-clip:padding-box");
  });

  it("keeps overwrite confirmation path and feedback on shared theme roles", () => {
    const target = declarations(".file-preview-confirmation-target");
    expect(target).toContain("border:1px solid color-mix(in srgb,var(--warning) 36%,var(--border))");
    expect(target).toContain("background:var(--panel-bg)");
    expect(declarations(".file-preview-confirmation-target>span")).toContain("color:var(--warning)");
    expect(declarations(".file-preview-confirmation-target>code")).toContain("color:var(--text)");
    expect(declarations(".file-preview-confirmation-target>code")).toContain("text-overflow:ellipsis");
  });

  it("shares terminal typography with the file code editor without replacing editor rendering states", () => {
    const root = declarations(":root");
    const editor = declarations(".file-code-editor .cm-editor");
    expect(root).toContain("--terminal-font-size:13px");
    expect(root).toContain("--terminal-line-height:1.22");
    expect(editor).toContain("font-family:var(--terminal-font-family)");
    expect(editor).toContain("font-size:var(--terminal-font-size)");
    expect(editor).toContain("line-height:var(--terminal-line-height)");
    expect(lastDeclarations(".file-code-editor .cm-activeLine")).toContain("background:var(--editor-active-line)");
    expect(lastDeclarations(".file-code-editor .cm-editor.cm-has-selection .cm-activeLine")).toContain("background:transparent");
    expect(lastDeclarations(".file-code-editor .cm-activeLineGutter")).toContain("background:var(--editor-active-line)");
    expect(lastDeclarations(".file-code-editor .cm-activeLineGutter")).toContain("color:var(--file-active-marker)");
    expect(lastDeclarations(".file-code-editor .cm-activeLineGutter")).toContain("color-mix(in srgb,var(--file-active-marker) 72%,transparent)");
    expect(lastDeclarations(".file-code-editor .cm-selectionBackground")).toContain("background:var(--editor-selection)!important");
    expect(lastDeclarations(".file-code-editor .cm-selectionBackground")).toContain("box-shadow:none");
    expect(lastDeclarations(".file-code-editor .cm-content::selection,.file-code-editor .cm-content ::selection")).toContain("color:var(--editor-selection-foreground)");
    expect(styles).toContain(".file-editor-operation{animation:file-editor-operation-lifecycle 1800ms ease both}");
    expect(lastDeclarations('.file-editor-operation[data-tone="error"]')).toContain("animation-duration:4200ms");
    expect(styles).toContain("@media(prefers-reduced-motion:reduce){.file-editor-operation{animation:none!important}}");
    expect(lastDeclarations(".file-row:hover,.file-row:focus-visible")).toContain("background:var(--file-active-surface)");
    expect(lastDeclarations(".file-row:hover,.file-row:focus-visible")).toContain("color-mix(in srgb,var(--file-active-marker) 72%,transparent)");
    expect(lastDeclarations(".file-row:hover .file-name svg,.file-row:focus-visible .file-name svg")).toContain("color:var(--file-active-marker)");
    expect(lastDeclarations(".file-row[data-selected]")).toContain("background:var(--file-selection-surface)");
    expect(lastDeclarations(".file-row[data-selected]")).toContain("box-shadow:inset 0 0 0 1px var(--file-selection-marker)");
    expect(lastDeclarations(".file-row[data-selected] .file-name")).toContain("color:var(--file-selection-foreground)");
    expect(lastDeclarations(".file-row[data-selected] .file-name small,.file-row[data-selected]>span:not(:first-child)")).toContain("color:var(--file-selection-secondary-foreground)");
    expect(defaultCapability.permissions).toContain("clipboard-manager:allow-write-image");
    expect(defaultCapability.permissions).not.toContain("clipboard-manager:allow-read-image");
  });

  it("keeps path editing inline and anchors refresh to the far edge", () => {
    expect(declarations(".file-browser-navigation")).toContain("display:grid");
    expect(declarations(".file-browser-navigation")).toContain("grid-template-columns:25px 25px minmax(0,1fr) 25px 25px 25px 25px");
    expect(declarations(".file-browser-navigation:not([data-upload-action])")).toContain("grid-template-columns:25px 25px minmax(0,1fr) 25px 25px 25px");
    expect(declarations(".file-upload-menu")).toContain("width:164px");
    expect(declarations(".file-browser-path-shell")).toContain("min-width:0");
    expect(declarations(".file-browser-path-form input")).toContain("border:0");
    expect(declarations(".file-browser-path-form input")).toContain("background:transparent");
    expect(declarations(".file-browser-path-form input:focus,.file-browser-path-form input:focus-visible")).toContain("box-shadow:inset 0 -1px 0 var(--focus)");
    expect(styles).not.toContain(".file-local-root-row");
  });

  it("keeps directory counts and transfer progress in one narrow fixed footer", () => {
    expect(declarations(".file-browser-statusbar")).toContain("height:22px");
    expect(declarations(".file-browser-statusbar")).toContain("font-size:9px");
    expect(declarations(".file-browser-statusbar")).toContain("flex:none");
    expect(declarations(".file-browser-transfer-progress")).toContain("height:3px");
  });

  it("keeps sortable file headers compact, aligned, and keyboard visible", () => {
    expect(declarations(".file-browser-columns,.file-row")).toContain("grid-template-columns:minmax(120px,1fr) 68px 78px 132px");
    expect(declarations(".file-browser-columns")).toContain("position:sticky");
    expect(declarations(".file-browser-columns")).toContain("padding:0 8px");
    expect(declarations(".file-browser-sort-button,.file-browser-column-label")).toContain("height:23px");
    expect(declarations(".file-browser-sort-button")).toContain("background:transparent");
    expect(declarations(".file-browser-sort-button:focus-visible")).toContain("outline:2px solid var(--focus)");
    expect(declarations(".file-browser-sort-button[data-sort-direction] .file-sort-indicator")).toContain("color:var(--accent)");
    expect(declarations(".file-browser-columns>:not(:first-child)")).toContain("justify-content:center");
    expect(declarations(".file-browser-columns>:not(:first-child) .file-sort-indicator")).toContain("position:absolute");
    expect(declarations(".file-row>span:not(:first-child)")).toContain("text-align:center");
    expect(declarations(".file-permission")).toContain("font-family:var(--terminal-font-family)");
    expect(styles).toContain("@container (max-width:440px)");
    expect(styles).toContain(".file-permission-column{display:none}");
  });

  it("uses the terminal font hierarchy for readable file rows", () => {
    expect(declarations(":root")).toContain('--terminal-font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace');
    expect(declarations(".file-list>.file-row")).toContain("font-family:var(--terminal-font-family)");
    expect(declarations(".file-list>.file-row")).toContain("font-size:11px");
    expect(declarations(".file-list>.file-row")).toContain("font-weight:500");
    expect(declarations(".file-name")).toContain("color:var(--text)");
    expect(declarations(".file-name")).toContain("font-weight:600");
    expect(declarations(".file-row>span:not(:first-child)")).toContain("color:var(--dim)");
  });

  it("fills folder icons while keeping ordinary file icons outlined", () => {
    expect(declarations('.file-row[data-entry-kind="directory"] .file-name svg')).toContain("fill:currentColor");
    expect(declarations('.file-row[data-entry-kind="directory"] .file-name svg')).toContain("stroke:currentColor");
    expect(declarations(".file-name svg")).not.toContain("fill:");
  });

  it("keeps virtual file rows inside the existing scroll surface", () => {
    expect(declarations(".file-list-virtual")).toContain("position:relative");
    expect(declarations(".file-list-virtual")).toContain("padding:0");
    expect(declarations(".file-list-virtual>.file-row")).toContain("position:absolute");
    expect(declarations(".file-list-virtual>.file-row")).toContain("height:27px");
    expect(declarations(".file-browser-content")).toContain("overflow:auto");
  });

  it("keeps native file-drop feedback inside the file content surface", () => {
    expect(declarations(".file-browser-content")).toContain("position:relative");
    expect(declarations(".file-upload-drop-overlay")).toContain("position:absolute");
    expect(declarations(".file-upload-drop-overlay")).toContain("pointer-events:none");
    expect(declarations(".file-upload-drop-overlay")).toContain("border:1px dashed");
  });

  it("assigns about-page scrolling to its content stage and preserves reduced motion", () => {
    expect(declarations(".about-dialog .dialog-content")).toContain("display:flex");
    expect(declarations(".about-dialog .dialog-content")).toContain("overflow:hidden");
    expect(declarations(".about-page")).toContain("min-height:0");
    expect(declarations(".about-page")).toContain("overflow:auto");
    expect(styles).toContain("@media(prefers-reduced-motion:reduce){.about-dialog *");
  });

  it("uses a narrow terminal-themed scrollbar with animated visibility", () => {
    const viewport = declarations(".terminal-surface .xterm-viewport");
    const scrollbar = declarations(".terminal-surface .xterm-viewport::-webkit-scrollbar");
    const thumb = declarations(".terminal-surface .xterm-viewport::-webkit-scrollbar-thumb");

    expect(viewport).toContain("transition:color 180ms");
    expect(scrollbar).toContain("width:3px");
    expect(thumb).toContain("background:currentColor");
    expect(styles).toContain("scrollbar-width:thin");
    expect(styles).toContain(".terminal-surface:hover .xterm-viewport");
    expect(styles).toContain("color:#438b7d");
    expect(declarations(".terminal-surface .xterm-scrollable-element>.scrollbar")).toContain("transition:opacity 140ms");
    expect(declarations(".terminal-surface .xterm-scrollable-element>.invisible.fade")).toContain("transition-duration:260ms");
    expect(declarations(".terminal-surface .xterm-decoration-overview-ruler")).toContain("opacity:0");
  });
});
