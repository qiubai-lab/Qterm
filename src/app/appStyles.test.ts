// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/app/app.css", "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("application layout styles", () => {
  it("fills tall terminal blocks with one continuous terminal surface", () => {
    const terminalSurface = declarations(".terminal-surface");
    const xtermSurface = declarations(".terminal-surface>.xterm");

    expect(terminalSurface).toContain("min-height:0");
    expect(terminalSurface).toContain("flex:1");
    expect(terminalSurface).not.toContain("padding:");
    expect(terminalSurface).toContain("background:#050607");
    expect(xtermSurface).toContain("height:100%");
    expect(xtermSurface).toContain("padding:4px 3px 2px 7px");
  });

  it("keeps canvas and split gutters compact", () => {
    expect(declarations(".workspace-canvas")).toContain("padding:2px");
    expect(styles).not.toContain(".terminal-block.maximized");
    expect(styles).not.toContain(".terminal-block.hidden-by-maximize");
    expect(declarations(".split-horizontal>.split-divider")).toContain("width:3px");
    expect(declarations(".split-vertical>.split-divider")).toContain("height:3px");
  });

  it("makes active blocks obvious and moves one non-interactive focus indicator", () => {
    const activeBlock = declarations(".terminal-block.active");
    const activeHeader = declarations(".terminal-block.active>.terminal-block-header");
    const indicator = declarations(".active-block-indicator");
    const movingIndicator = declarations(".active-block-indicator.ready");

    expect(activeBlock).toContain("border-color:#5cae9e");
    expect(activeBlock).toContain("box-shadow:");
    expect(activeHeader).toContain("background:linear-gradient");
    expect(indicator).toContain("pointer-events:none");
    expect(movingIndicator).toContain("transition:transform 300ms");
    expect(styles).toContain("@media (prefers-reduced-motion:reduce)");
    expect(styles).toContain(".active-block-indicator.ready{transition:none}");
  });

  it("keeps terminal and files block actions visible without hover", () => {
    expect(declarations(".block-actions")).toContain("opacity:1");
    expect(styles).not.toContain(".terminal-block:hover .block-actions,.terminal-block.active .block-actions");
  });

  it("keeps the labeled utility rail compact and visually secondary", () => {
    expect(declarations(".workspace-stage-content")).toContain("grid-template-columns:minmax(0,1fr) 62px");
    expect(declarations(".rail-button")).toContain("grid-template-rows:18px auto");
    expect(declarations(".rail-button-label")).toContain("font-size:8px");
    expect(declarations(".rail-button-label")).toContain("color:#737a84");
  });

  it("uses a sliding segmented connection tab with directional, reduced-motion-aware content transitions", () => {
    expect(declarations(".dialog-actions.connection-editor-actions")).toContain("justify-content:flex-end");
    expect(declarations(".connection-editor-tabs")).toContain("grid-template-columns:1fr 1fr");
    expect(declarations(".connection-editor-tab-indicator")).toContain("transition:transform 260ms");
    expect(declarations('.connection-editor-tabs[data-active="authentication"] .connection-editor-tab-indicator')).toContain("translateX(100%)");
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
    expect(declarations(".credential-public-key-copy")).toContain("width:25px");
    expect(declarations(".credential-feedback-bubble")).toContain("position:fixed");
    expect(declarations(".credential-feedback-bubble")).toContain("pointer-events:none");
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
    expect(declarations(".auth-method-indicator")).toContain("transition:transform 260ms");
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
    expect(declarations(".connection-item")).toContain("grid-template-columns:5px minmax(0,1fr)");
    expect(declarations(".connection-item")).toContain("touch-action:none");
    expect(declarations(".connection-item-status")).toContain("border-radius:50%");
    expect(declarations(".connection-item-endpoint")).toContain("font-family:");
    expect(declarations(".connection-item-address")).toContain("text-overflow:ellipsis");
    expect(declarations(".connection-item-auth")).toContain("flex:none");
    expect(declarations(".connection-item.selected")).not.toContain("inset 2px 0");
    expect(declarations(".vault-status-button")).toContain("min-height:26px");
    expect(declarations(".password-input-shell")).toContain("position:relative");
    expect(declarations(".password-visibility-button")).toContain("position:absolute");
    expect(declarations(".password-visibility-button")).toContain("width:24px");
    expect(declarations(".connection-group-section")).toContain("margin:0 0 3px");
    expect(declarations(".connection-group-heading.drop-target")).toContain("border-color:#5cae9e");
    expect(declarations(".connection-context-menu")).toContain("position:fixed");
    expect(declarations(".connection-context-menu")).toContain("animation:connection-menu-in");
    expect(declarations(".connection-drag-preview")).toContain("position:fixed");
    expect(declarations(".connection-drag-preview")).toContain("pointer-events:none");
    expect(styles).toContain("@keyframes connection-menu-in");
    expect(styles).toContain(".connection-context-menu,.file-context-menu{animation:none}");
  });

  it("anchors connection save feedback to the button and disables spinner motion when requested", () => {
    expect(declarations(".connection-save-button")).toContain("position:relative");
    expect(declarations(".connection-save-button.saving>span::before")).toContain("animation:connection-save-spin");
    expect(declarations(".connection-save-button.success")).toContain("background:#245d51");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.connection-save-button\.saving>span::before\{animation:none!important\}/);
  });

  it("keeps the terminal lock inside the workspace stage with opaque accessibility fallbacks", () => {
    expect(declarations(".dialog-scrim-blocking")).toContain("z-index:1000");
    expect(declarations(".dialog-scrim-blocking")).toContain("background:#020304e8");
    expect(declarations(".workspace-stage")).toContain("position:relative");
    expect(declarations(".workspace-stage-content")).toContain("grid-template-columns:minmax(0,1fr) 62px");
    expect(declarations(".terminal-lock-scrim")).toContain("position:absolute");
    expect(declarations(".terminal-lock-scrim")).toContain("inset:0");
    expect(declarations(".terminal-lock-options")).toContain("display:grid");
    expect(declarations(".terminal-lock-dialog")).toContain("background:#151917fa");
    expect(declarations(".dialog-action-status")).toContain("height:30px");
    expect(declarations(".dialog-action-status")).toContain("white-space:nowrap");
    expect(declarations(".dialog-action-status")).toContain("text-overflow:ellipsis");
    expect(styles).toContain(".dialog-scrim-blocking{background:#020304ff}");
  });

  it("keeps settings navigation fixed, scrolls only configuration content, and renders a real switch thumb", () => {
    expect(declarations(".settings-dialog")).toContain("height:min(");
    expect(declarations(".settings-dialog>.dialog-content")).toContain("flex:1");
    expect(declarations(".settings-layout")).toContain("grid-template-columns:176px minmax(0,1fr)");
    expect(declarations(".settings-layout")).toContain("min-height:0");
    expect(declarations(".settings-layout")).toContain("overflow:hidden");
    expect(declarations(".settings-content-scroll")).toContain("overflow:auto");
    expect(declarations(".settings-path-control")).toContain("grid-template-columns:minmax(0,1fr) auto");
    expect(declarations(".settings-path-control input")).toContain("font-family:");
    expect(declarations(".settings-migration-callout")).toContain("border:");
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
    expect(declarations(".file-preview-toolbar .file-edit-button,.file-preview-toolbar .file-cancel-button,.file-preview-toolbar .file-save-button")).toContain("height:23px");
    expect(declarations(".file-preview-toolbar .file-edit-button,.file-preview-toolbar .file-cancel-button,.file-preview-toolbar .file-save-button")).toContain("display:flex");
    expect(styles).toContain(".file-preview-toolbar .file-save-button{width:48px}");
    expect(declarations(".file-code-editor:not([data-read-only]) .cm-cursor,.file-code-editor:not([data-read-only]) .cm-dropCursor")).toContain("border-left-color:var(--accent)");
    expect(styles).toContain(".connection-context-menu,.file-context-menu{animation:none}");
  });

  it("keeps path editing inline and anchors refresh to the far edge", () => {
    expect(declarations(".file-browser-navigation")).toContain("display:grid");
    expect(declarations(".file-browser-navigation")).toContain("grid-template-columns:25px minmax(0,1fr) 25px 25px 25px");
    expect(declarations(".file-browser-path-shell")).toContain("min-width:0");
    expect(declarations(".file-browser-path-form input")).toContain("border:0");
    expect(declarations(".file-browser-path-form input")).toContain("background:transparent");
    expect(declarations(".file-browser-path-form input:focus,.file-browser-path-form input:focus-visible")).toContain("box-shadow:inset 0 -1px 0 var(--focus)");
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
    expect(declarations(".file-permission")).toContain("font:");
    expect(styles).toContain("@container (max-width:440px)");
    expect(styles).toContain(".file-permission-column{display:none}");
  });

  it("keeps native file-drop feedback inside the file content surface", () => {
    expect(declarations(".file-browser-content")).toContain("position:relative");
    expect(declarations(".file-upload-drop-overlay")).toContain("position:absolute");
    expect(declarations(".file-upload-drop-overlay")).toContain("pointer-events:none");
    expect(declarations(".file-upload-drop-overlay")).toContain("border:1px dashed");
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
