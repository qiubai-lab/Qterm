import { describe, expect, it } from "vitest";

// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";

const gitStyleFiles = [
  "gitShell.css",
  "gitGraph.css",
  "gitTargetConfig.css",
  "gitBranchOverlays.css",
  "gitMergeOverlays.css",
  "gitOperationOverlay.css",
  "gitRepositoryPicker.css",
  "gitRepositoryHistory.css",
  "gitMedia.css",
] as const;
const gitStyleManifest = readFileSync("src/git/git.css", "utf8").replace(/\r\n/g, "\n");
const styles = gitStyleFiles
  .map((file) => readFileSync(`src/git/styles/${file}`, "utf8"))
  .join("\n")
  .replace(/\r\n/g, "\n");
const cyberTheme = readFileSync("src/app/styles/themes/cyberpunk.css", "utf8").replace(/\r\n/g, "\n");
const fileBrowserStyles = readFileSync("src/files/fileBrowser.css", "utf8").replace(/\r\n/g, "\n");

function declarations(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const open = styles.indexOf("{", start);
  const close = styles.indexOf("}", open);
  return styles.slice(open + 1, close).replace(/\s+/g, " ");
}

function lastDeclarations(selector: string): string {
  const start = styles.lastIndexOf(`${selector} {`);
  if (start < 0) return "";
  const open = styles.indexOf("{", start);
  const close = styles.indexOf("}", open);
  return styles.slice(open + 1, close).replace(/\s+/g, " ");
}

describe("Git pane style contracts", () => {
  it("loads focused style modules in their original cascade order", () => {
    const imports = gitStyleManifest.match(/@import "\.\/styles\/(.+?)";/g) ?? [];
    expect(imports).toEqual(gitStyleFiles.map((file) => `@import "./styles/${file}";`));

    for (const file of gitStyleFiles) {
      const lineCount = readFileSync(`src/git/styles/${file}`, "utf8").split(/\r?\n/).length - 1;
      expect(lineCount, file).toBeLessThanOrEqual(900);
    }
  });

  it("gives repository history one bounded themed popover scroller", () => {
    const popover = declarations(".git-repository-history-popover");
    expect(popover).toContain("position: fixed");
    expect(popover).toContain("z-index: 130");
    expect(popover).toContain("overflow: hidden");
    expect(popover).toContain("background: var(--floating-material)");
    expect(declarations(".git-repository-history-scroll")).toContain("max-height: min(320px, calc(100vh - 132px))");
    expect(declarations(".git-repository-history-scroll")).toContain("overflow-y: auto");
    expect(declarations(".git-repository-history-scroll")).toContain("scrollbar-color: var(--scrollbar-thumb) transparent");
    expect(declarations(".git-repository-history-browse")).toContain("flex: none");
    expect(declarations('.git-repository-history-item[aria-current="true"]')).toContain("var(--selection-surface)");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".git-repository-history-popover");
  });

  it("gives the remote repository picker one bounded directory scroller", () => {
    expect(declarations(".git-repository-picker-dialog")).toContain("height: min(470px, calc(100vh - 48px))");
    expect(declarations(".git-repository-picker-dialog .dialog-content")).toContain("display: flex");
    expect(declarations(".git-repository-picker-dialog .dialog-content")).toContain("min-height: 0");
    expect(declarations(".git-repository-picker-dialog .dialog-content")).toContain("overflow: hidden");
    expect(declarations(".git-repository-picker")).toContain("min-height: 0");
    expect(declarations(".git-repository-picker")).toContain("flex: 1");
    expect(declarations(".git-repository-picker-toolbar")).toContain("flex: none");
    expect(declarations(".git-repository-picker-list-scroll")).toContain("min-height: 0");
    expect(declarations(".git-repository-picker-list-scroll")).toContain("flex: 1");
    expect(declarations(".git-repository-picker-list-scroll")).toContain("overflow: auto");
    expect(declarations(".git-repository-picker-list-scroll")).toContain("scrollbar-color: var(--scrollbar-thumb) transparent");
    expect(declarations(".git-repository-picker-feedback")).toContain("min-height: 34px");
    expect(declarations(".git-repository-picker-footer")).toContain("flex: none");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".git-repository-picker-row-shell button");
  });

  it("inherits the terminal workbench background across Git content surfaces", () => {
    expect(declarations(".git-block")).toContain("background: var(--workbench-panel)");
    expect(declarations(".git-pane")).toContain("background: transparent");
    expect(declarations(".git-repository-section .git-section-content")).toContain("background: transparent");
  });

  it("keeps visual position independent from collapsed state", () => {
    expect(declarations(".git-pane")).toContain("display: flex");
    expect(declarations(".git-pane")).toContain("flex-direction: column");
    expect(declarations(".git-repository-section")).not.toContain("order:");
    expect(declarations(".git-changes-section")).not.toContain("order:");
    expect(declarations(".git-graph-section")).not.toContain("order:");
    expect(declarations(".git-changes-section")).toContain("flex: 1 1 160px");
    expect(declarations(".git-graph-section")).toContain("flex: 1 1 140px");
    expect(declarations(".git-graph-section")).not.toContain("flex: .75 1 140px");
    expect(declarations(".git-graph-section")).toContain("margin-top: 0");
    expect(styles).not.toContain(".git-changes-section.collapsed {");
    expect(declarations(".git-graph-section.collapsed")).toContain("margin-top: auto");
  });

  it("keeps headers static while content slides in and out", () => {
    expect(declarations(".git-section")).not.toContain("transition:");
    expect(declarations(".git-section-body")).toContain("transition: opacity 160ms ease-out");
    expect(declarations(".git-section-body")).not.toContain("will-change:");
    expect(declarations(".git-section-body")).not.toContain("transform:");
    expect(styles).not.toContain(".git-section:not(.collapsed) .git-section-header");
    expect(styles).not.toContain(".git-section-toggle:active");
    expect(declarations(".git-section-toggle svg")).toContain("transition: transform 180ms");
    expect(declarations(".git-section.collapsed .git-section-toggle svg")).toContain("rotate(-90deg)");
    expect(declarations(".git-section-content")).toContain("transition: transform 180ms cubic-bezier(.22, 1, .36, 1)");
    expect(declarations(".git-section-content")).not.toContain("transform:");
    expect(declarations(".git-section-content")).not.toContain("will-change:");
    expect(declarations(".git-section.collapsed .git-section-content")).toContain("translateY(-4px)");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".git-section-body");
    expect(reducedMotion).toContain("transition: opacity 100ms ease-out");
    expect(reducedMotion).toContain(".git-section-content");
    expect(reducedMotion).toContain("transform: none");
  });

  it("keeps the commit composer vertical and gives the graph an unboxed topology rail", () => {
    expect(declarations(".git-commit-box")).toContain("flex-direction: column");
    expect(styles).toContain("max-height: 92px");
    expect(declarations(".git-commit-button")).toContain("width: 100%");
    expect(declarations(".git-commit-button")).toContain("justify-content: center");
    expect(declarations(".git-commit-button")).toContain("border: 1px solid color-mix(in srgb, var(--primary-action) 86%, var(--border))");
    expect(declarations(".git-commit-button")).toContain("color: var(--primary-action-contrast)");
    expect(declarations(".git-commit-button")).toContain("background: var(--primary-action)");
    expect(declarations(".git-commit-button")).toContain("font-size: 10.5px");
    expect(declarations(".git-commit-button")).toContain("font-weight: 700");
    expect(declarations(".git-commit-button")).toContain("letter-spacing: .04em");
    expect(declarations(".git-commit-button:hover:not(:disabled)")).toContain("background: color-mix(in srgb, var(--primary-action) 88%, var(--text))");
    expect(styles).not.toContain(".git-commit-button kbd");
    expect(declarations(".git-commit-box textarea:focus-visible")).toContain("outline: none");
    expect(declarations(".git-commit-box textarea:focus-visible")).toContain("border-color: var(--focus)");
    expect(cyberTheme).toContain("--primary-action:#fcee0a");
    expect(styles).toContain(".git-commit-box > button:not(.git-commit-button)");
    expect(cyberTheme).toContain("--accent:#00ddeb");
    expect(lastDeclarations(".git-graph-scroll")).toContain("display: flex");
    expect(lastDeclarations(".git-graph-scroll")).toContain("padding: 0");
    const rail = declarations(".git-graph-rail");
    expect(rail).toContain("background: transparent");
    expect(rail).not.toContain("border:");
    expect(rail).not.toContain("border-radius:");
    expect(rail).not.toContain("overflow:");
  });

  it("groups repository content and each graph commit in compact material containers", () => {
    const repository = declarations(".git-repository-card");
    expect(repository).toContain("margin: 5px 8px");
    expect(repository).toContain("overflow: hidden");
    expect(repository).toContain("border: 1px solid var(--subtle)");
    expect(repository).toContain("border-radius: 7px");
    expect(repository).toContain("background: color-mix(in srgb, var(--raised) 64%, var(--surface))");
    expect(repository).toContain("box-shadow: inset 0 1px");

    const graph = lastDeclarations(".git-graph-scroll");
    expect(graph).toContain("display: flex");
    expect(graph).toContain("flex-direction: column");
    expect(graph).toContain("flex: 1 1 0");
    expect(graph).toContain("margin: 7px 2px 7px 8px");
    expect(graph).toContain("padding: 0 6px 0 0");
    expect(graph).toContain("background: transparent");
    expect(graph).toContain("align-self: stretch");
    expect(graph).toContain("overflow-x: hidden");
    expect(graph).toContain("overflow-y: auto");
    expect(graph).not.toContain("height:");
    expect(graph).not.toContain("max-height:");
    expect(graph).not.toContain("border:");
    expect(graph).not.toContain("box-shadow:");
    const commit = lastDeclarations(".git-commit-card");
    expect(commit).toContain("overflow: hidden");
    expect(commit).toContain("border: 1px solid");
    expect(commit).toContain("border-radius: 6px");
    expect(commit).toContain("background: color-mix(in srgb, var(--raised) 42%, var(--surface))");
    const scrollers = declarations(".git-change-scroll,\n.git-graph-scroll,\n.git-branch-list");
    expect(scrollers).toContain("flex: 1");
    expect(scrollers).toContain("min-height: 0");
    expect(declarations(".git-graph-section .git-section-content")).toContain("flex: 1");
    expect(declarations(".git-graph-section .git-section-content")).toContain("min-height: 0");
    expect(declarations(".git-graph-section .git-section-content")).toContain("height: 100%");
    expect(declarations(".git-graph-section .git-section-body")).toContain("grid-template-rows: minmax(0, 1fr)");
  });

  it("matches the file manager scrollbar and reserves the graph card lane", () => {
    const scrollers = declarations(".git-change-scroll,\n.git-graph-scroll,\n.git-branch-list");
    expect(scrollers).toContain("scrollbar-color: var(--scrollbar-thumb) transparent");
    expect(scrollers).toContain("scrollbar-width: thin");
    expect(fileBrowserStyles).toContain("scrollbar-color:var(--scrollbar-thumb) transparent");
    const scrollbar = declarations(".git-change-scroll::-webkit-scrollbar,\n.git-graph-scroll::-webkit-scrollbar,\n.git-branch-list::-webkit-scrollbar");
    expect(scrollbar).toContain("width: 5px");
    expect(scrollbar).toContain("height: 5px");
    expect(declarations(".git-change-scroll::-webkit-scrollbar-track,\n.git-graph-scroll::-webkit-scrollbar-track,\n.git-branch-list::-webkit-scrollbar-track")).toContain("background: transparent");
    const thumb = declarations(".git-change-scroll::-webkit-scrollbar-thumb,\n.git-graph-scroll::-webkit-scrollbar-thumb,\n.git-branch-list::-webkit-scrollbar-thumb");
    expect(thumb).toContain("border: 1px solid transparent");
    expect(thumb).toContain("border-radius: 999px");
    expect(thumb).toContain("background: var(--scrollbar-thumb)");
    expect(thumb).toContain("background-clip: padding-box");
    expect(declarations(".git-change-scroll::-webkit-scrollbar-thumb:hover,\n.git-graph-scroll::-webkit-scrollbar-thumb:hover,\n.git-branch-list::-webkit-scrollbar-thumb:hover")).toContain("color-mix(in srgb, var(--scrollbar-thumb) 82%, var(--accent))");
    expect(cyberTheme).toContain("--scrollbar-thumb:#168996");
    expect(cyberTheme).toContain("--accent:#00ddeb");
  });

  it("uses independent cards for each change list without an outer card", () => {
    const changes = declarations(".git-change-scroll");
    expect(changes).toContain("margin: 0 8px 7px");
    expect(changes).toContain("padding: 0");
    expect(changes).toContain("background: transparent");
    expect(changes).toContain("scrollbar-gutter: stable");
    expect(changes).not.toContain("border:");
    expect(changes).not.toContain("box-shadow:");
    const group = declarations(".git-change-group");
    expect(group).toContain("border: 1px solid");
    expect(group).toContain("border-radius: 5px");
    expect(group).toContain("background:");
  });

  it("uses a stable semantic merge state bar with restrained attention and explicit actions", () => {
    const mergeState = declarations(".git-merge-state");
    expect(mergeState).toContain("display: grid");
    expect(mergeState).toContain("border: 1px solid color-mix(in srgb, var(--warning)");
    expect(mergeState).toContain("background: color-mix(in srgb, var(--warning)");
    expect(mergeState).toContain("color: var(--text)");
    expect(declarations(".git-merge-state-copy")).toContain("min-width: 0");
    expect(declarations(".git-merge-state-actions")).toContain("display: flex");
    expect(declarations(".git-merge-state-actions .danger")).toContain("color: var(--danger)");
    expect(declarations('.git-operation-row[data-status="attention"] .git-operation-status')).toContain("color: var(--warning)");
    expect(mergeState).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("uses an icon-and-text branch trigger and portaled floating layers", () => {
    expect(declarations(".git-repository-actions")).toContain("display: flex");
    expect(declarations(".git-repository-actions")).toContain("gap: 3px");
    expect(declarations(".git-repository-row")).toContain("padding: 4px 6px");
    expect(declarations(".git-repository-sync")).toContain("display: inline-flex");
    expect(declarations(".git-repository-sync")).toContain("color: var(--accent)");
    expect(declarations(".git-repository-sync")).toContain("background: color-mix(in srgb, var(--accent) 9%, transparent)");
    expect(declarations(".git-repository-sync")).toContain("border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--subtle))");
    expect(declarations(".git-branch-trigger")).toContain("display: flex");
    expect(declarations(".git-branch-trigger")).toContain("width: max-content");
    expect(declarations(".git-branch-trigger")).toContain("height: 19px");
    expect(declarations(".git-repository-sync")).toContain("height: 19px");
    expect(declarations(".git-branch-trigger")).toContain("background: var(--primary-action)");
    expect(declarations(".git-branch-trigger")).toContain("color: var(--primary-action-contrast)");
    expect(declarations(".git-branch-trigger svg")).toContain("color: currentColor");
    expect(styles).not.toContain(".git-repository-row select");
    const popover = declarations(".git-repository-popover");
    expect(popover).toContain("position: fixed");
    expect(popover).toContain("z-index: 130");
    expect(popover).toContain("background: color-mix(in srgb, var(--raised) 98%, var(--canvas))");
    expect(popover).toContain("border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--floating-border))");
    const popoverTitle = declarations(".git-repository-popover-title");
    expect(popoverTitle).toContain("border-bottom: 1px solid color-mix(in srgb, var(--text) 9%, var(--subtle))");
    expect(popoverTitle).toContain("color: var(--text)");
    expect(popoverTitle).toContain("background: linear-gradient(180deg, color-mix(in srgb, var(--raised) 94%, var(--text)) 0%, color-mix(in srgb, var(--raised) 96%, var(--surface)) 100%)");
    expect(popoverTitle).toContain("box-shadow: inset 0 1px color-mix(in srgb, var(--text) 7%, transparent)");
    expect(popoverTitle).not.toContain("inset 2px 0 var(--accent)");
    expect(declarations(".git-branch-popover")).toContain("width: 336px");
    expect(declarations(".git-branch-popover")).toContain("padding: 0");
    expect(declarations(".git-branch-popover")).toContain("background: color-mix(in srgb, var(--raised) 98%, var(--canvas))");
    const branchSearch = declarations(".git-branch-search");
    expect(branchSearch).toContain("width: 0");
    expect(branchSearch).toContain("margin: 0");
    expect(branchSearch).toContain("border-radius: 0");
    expect(branchSearch).toContain("box-shadow: none");
    const branchSearchFocus = declarations(".git-branch-search:focus,\n.git-branch-search:focus-visible");
    expect(branchSearchFocus).toContain("border: 0");
    expect(branchSearchFocus).toContain("outline: 0");
    expect(branchSearchFocus).toContain("box-shadow: none");
    const branchList = lastDeclarations(".git-branch-list");
    expect(branchList).toContain("width: 100%");
    expect(branchList).toContain("gap: 3px");
    expect(branchList).toContain("padding: 4px 9px 4px 4px");
    expect(branchList).toContain("scrollbar-gutter: stable");
    expect(branchList).toContain("overscroll-behavior: contain");
    expect(declarations(".git-branch-list-group")).toContain("display: flex");
    expect(declarations(".git-branch-list-group")).toContain("flex-direction: column");
    expect(declarations(".git-branch-list-group")).toContain("gap: 3px");
    const branchGroupHeader = declarations(".git-branch-list-header");
    expect(branchGroupHeader).toContain("position: sticky");
    expect(branchGroupHeader).toContain("height: 22px");
    expect(branchGroupHeader).toContain("border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border))");
    expect(branchGroupHeader).toContain("color: var(--accent)");
    expect(branchGroupHeader).toContain("background: color-mix(in srgb, var(--accent) 15%, var(--raised))");
    const branchGroupCount = declarations(".git-branch-list-header span:last-child");
    expect(branchGroupCount).toContain("color: var(--accent)");
    expect(branchGroupCount).toContain("background: color-mix(in srgb, var(--accent) 14%, var(--surface))");
    const option = declarations('.git-branch-popover [role="option"]');
    expect(option).toContain("box-sizing: border-box");
    expect(option).toContain("width: 100%");
    expect(option).toContain("border-radius: 6px");
    expect(declarations('.git-branch-popover [role="option"][aria-selected="true"]')).toContain("var(--primary-action)");
    expect(declarations('.git-branch-popover [role="option"][aria-selected="true"]:hover')).toContain("repeating-linear-gradient");
    expect(lastDeclarations(".git-branch-option-meta")).toContain("display: block");
    expect(lastDeclarations(".git-branch-option-meta")).toContain("padding-left: 0");
    expect(lastDeclarations(".git-branch-option-meta")).toContain("color: color-mix(in srgb, var(--muted) 72%, var(--dim))");
    expect(lastDeclarations(".git-branch-option-meta")).toContain("text-overflow: ellipsis");
    const metadataIdentity = declarations(".git-branch-author,\n.git-branch-oid");
    expect(metadataIdentity).toContain("color: color-mix(in srgb, var(--text) 24%, var(--muted))");
    expect(metadataIdentity).toContain("font-weight: 550");
    expect(metadataIdentity).not.toContain("width:");
    expect(metadataIdentity).not.toContain("flex:");
    expect(declarations('.git-branch-popover [role="option"][data-kind="remote"] .git-branch-option-primary > svg')).toContain("var(--accent) 64%");
    expect(styles).not.toContain(".git-branch-upstream");
  });

  it("keeps P0 Git action and form popovers compact, themed, and independently scrollable", () => {
    const actionMenu = declarations(".git-repository-action-popover");
    expect(actionMenu).toContain("width: 210px");
    expect(actionMenu).toContain("background: color-mix(in srgb, var(--raised) 98%, var(--canvas))");
    expect(declarations(".git-repository-action-popover > .git-repository-popover-title")).toBe("");
    expect(declarations(".git-repository-action-item")).toContain("height: 28px");
    expect(declarations(".git-repository-action-item:hover:not(:disabled)")).toContain("background: color-mix(in srgb, var(--accent) 12%, var(--raised))");
    const expandedAction = declarations('.git-repository-action-item[aria-expanded="true"]');
    expect(expandedAction).toContain("background: color-mix(in srgb, var(--accent) 12%, var(--raised))");
    expect(expandedAction).toContain("box-shadow: inset 2px 0 var(--accent)");
    expect(declarations(".git-repository-action-item:focus-visible")).toContain("outline: 2px solid var(--focus)");
    expect(declarations(".git-repository-action-separator")).toContain("var(--accent) 22%");
    const submenu = declarations(".git-repository-submenu");
    expect(submenu).toContain("position: fixed");
    expect(submenu).toContain("z-index: 131");
    const form = declarations(".git-branch-management-popover");
    expect(form).toContain("width: 292px");
    expect(declarations(".git-merge-popover")).toContain("width: 420px");
    expect(declarations(".git-merge-popover-title")).toContain("min-height: 39px");
    expect(declarations(".git-merge-popover-title small")).toContain("text-overflow: ellipsis");
    expect(declarations(".git-merge-flow")).toContain("grid-template-columns: minmax(0, 1fr) 54px minmax(0, 1fr)");
    const mergeNode = declarations(".git-merge-node");
    expect(mergeNode).toContain("min-height: 68px");
    expect(mergeNode).toContain("var(--accent) 42%");
    const mergeNodeTitle = declarations(".git-merge-node-title");
    expect(mergeNodeTitle).toContain("height: 15px");
    expect(mergeNodeTitle).toContain("align-self: center");
    expect(mergeNodeTitle).toContain("margin: 0");
    expect(mergeNodeTitle).toContain("line-height: 1");
    const branchField = declarations(".git-merge-branch-field");
    expect(branchField).toContain("width: 100%");
    expect(branchField).toContain("height: 29px");
    expect(branchField).toContain("background: var(--control-bg)");
    const branchValue = declarations(".git-merge-branch-field > select,\n.git-merge-branch-value");
    expect(branchValue).toContain("height: 100%");
    expect(branchValue).toContain("border: 0");
    expect(branchValue).toContain("background: transparent");
    expect(branchValue).toContain("text-overflow: ellipsis");
    const mergeSourceSelect = declarations(".git-merge-branch-field > select");
    expect(mergeSourceSelect).toContain("appearance: none");
    expect(mergeSourceSelect).toContain("color-scheme: dark");
    const mergeOptions = declarations(".git-merge-branch-field > select optgroup,\n.git-merge-branch-field > select option");
    expect(mergeOptions).toContain("color: var(--text)");
    expect(mergeOptions).toContain("background: var(--canvas)");
    expect(declarations(".git-merge-branch-field > select option:checked")).toContain("background: var(--hover)");
    expect(declarations(".git-merge-source-node")).toBe("");
    expect(declarations(".git-merge-target-node")).toBe("");
    expect(declarations(".git-merge-flow-track::before")).toContain("linear-gradient");
    expect(declarations(".git-merge-flow-track::after")).toBe("");
    expect(declarations(".git-merge-flow-connector")).toContain("position: relative");
    expect(declarations(".git-merge-flow-track")).toContain("top: 50%");
    expect(declarations(".git-merge-flow-connector > svg")).toContain("transform: translateY(-50%)");
    expect(declarations(".git-merge-flow-packet")).toContain("animation: git-merge-flow-packet 1.8s ease-in-out infinite");
    expect(declarations(".git-merge-actions .git-merge-cancel")).toContain("var(--danger)");
    expect(declarations(".dialog-scrim.git-merge-confirmation-scrim")).toContain("z-index: 140");
    expect(declarations(".git-operation-list")).toContain("overflow-y: auto");
    expect(declarations(".git-operation-list")).toContain("scrollbar-color: var(--scrollbar-thumb) transparent");
    expect(declarations('.git-operation-row[data-status="error"]')).toContain("var(--danger)");
    expect(declarations(".git-branch-management-danger")).toContain("var(--danger)");
    expect(declarations('.git-repository-refresh[data-updating="true"] svg')).toContain("animation: git-repository-picker-spin 700ms linear infinite");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain('.git-repository-refresh[data-updating="true"] svg');
    expect(reducedMotion).toContain(".git-merge-flow-packet");
  });

  it("presents graph commits as selectable two-line rows with a legible glass selection", () => {
    const row = declarations(".git-commit-row");
    expect(row).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(row).toContain("width: 100%");
    const selected = declarations('.git-commit-row[aria-pressed="true"] .git-commit-card');
    expect(selected).toContain("border-color: var(--selection-marker)");
    expect(selected).toContain("color: var(--text)");
    expect(selected).toContain("background: linear-gradient");
    expect(selected).toContain("0 0 10px color-mix(in srgb, var(--selection-marker) 24%, transparent)");
    expect(selected).toContain("backdrop-filter: blur(12px) saturate(125%)");
    expect(selected).not.toContain("background: var(--primary-action)");
    const selectedSubject = declarations('.git-commit-row[aria-pressed="true"] .git-commit-subject');
    expect(selectedSubject).toContain("color: var(--selection-marker)");
    expect(selectedSubject).toContain("text-shadow: 0 0 8px");
    expect(declarations('.git-commit-row[aria-pressed="true"] .git-commit-meta')).toContain("color: var(--muted)");
    const expander = declarations(".git-commit-expander");
    expect(expander).toContain("background: transparent");
    expect(expander).not.toContain("border:");
    expect(expander).not.toContain("border-radius:");
    expect(expander).not.toContain("box-shadow:");
    const selectedExpander = declarations('.git-commit-row[aria-pressed="true"] .git-commit-expander');
    expect(selectedExpander).toContain("color: var(--selection-marker)");
    expect(selectedExpander).not.toContain("border:");
    expect(selectedExpander).not.toContain("background:");
    expect(selectedExpander).not.toContain("box-shadow:");
    const highContrast = styles.slice(styles.indexOf("@media (prefers-contrast: more)"));
    expect(highContrast).toContain('.git-commit-row[aria-pressed="true"] :is(.git-commit-card)');
    expect(highContrast).toContain("border-color: var(--selection-marker)");
    expect(declarations('.git-commit-row[aria-pressed="true"] .git-graph-lanes circle')).not.toContain("stroke:");
    expect(styles).toContain("stroke: var(--git-graph-lane-color)");
    for (let lane = 1; lane <= 6; lane += 1) {
      expect(styles).toContain(`--git-graph-lane-color: var(--git-graph-lane-${lane})`);
    }
    expect(declarations(".git-commit-summary")).toContain("display: flex");
    expect(declarations('.git-decorations > span[data-kind="head"]')).toContain("var(--primary-action)");
    expect(declarations('.git-decorations > span[data-kind="remote"]')).toContain("var(--accent)");
  });

  it("falls back to an opaque selected commit when transparency is reduced", () => {
    const selected = lastDeclarations('.git-commit-row[aria-pressed="true"] :is(.git-commit-card)');
    expect(selected).toContain("background: color-mix");
    expect(selected).toContain("var(--selection-marker)");
    expect(selected).toContain("backdrop-filter: none");
    expect(selected).toContain("-webkit-backdrop-filter: none");
  });

  it("truncates constrained branch and tag labels with an ellipsis", () => {
    const decorationLabel = declarations(".git-decoration-label");
    expect(decorationLabel).toContain("min-width: 0");
    expect(decorationLabel).toContain("overflow: hidden");
    expect(decorationLabel).toContain("text-overflow: ellipsis");
    expect(decorationLabel).toContain("white-space: nowrap");
  });

  it("uses a viewport-safe floating material for commit hover details", () => {
    const tooltip = declarations(".git-commit-tooltip");
    expect(tooltip).toContain("position: fixed");
    expect(tooltip).toContain("z-index: 130");
    expect(tooltip).toContain("width: min(380px, calc(100vw - 16px))");
    expect(tooltip).toContain("border: 1px solid var(--floating-border)");
    expect(tooltip).toContain("background: var(--floating-material)");
    expect(tooltip).toContain("pointer-events: none");
    expect(tooltip).toContain("animation: git-commit-tooltip-in 140ms");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".git-commit-tooltip");
    expect(reducedMotion).toContain("animation: none");
  });

  it("shows lazy commit files as an indented themed continuation of the graph", () => {
    const shell = declarations(".git-commit-details-shell");
    expect(shell).toContain("display: grid");
    expect(shell).toContain("grid-template-rows: 0fr");
    expect(shell).toContain("transition: grid-template-rows 180ms cubic-bezier(.22, 1, .36, 1)");
    expect(shell).not.toContain("opacity:");
    expect(shell).not.toContain("transform:");
    expect(declarations(".git-commit-details-shell.expanded")).toContain("grid-template-rows: 1fr");
    const details = declarations(".git-commit-details");
    expect(details).toContain("display: grid");
    expect(details).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(details).toContain("overflow: hidden");
    expect(details).not.toContain("opacity:");
    expect(details).not.toContain("transform:");
    expect(details).not.toContain("min-height:");
    expect(details).not.toContain("max-height:");
    const continuation = declarations(".git-graph-continuation");
    expect(continuation).toContain("position: relative");
    expect(continuation).not.toContain("min-height:");
    expect(continuation).not.toContain("max-height:");
    expect(continuation).not.toContain("background:");
    expect(continuation).not.toContain("border:");
    const continuationSvg = declarations(".git-graph-continuation svg");
    expect(continuationSvg).toContain("position: absolute");
    expect(continuationSvg).toContain("height: 100%");
    expect(declarations(".git-graph-continuation line")).toContain("stroke: var(--git-graph-lane-color)");
    expect(declarations(".git-graph-bridge")).toContain("height: 7px");
    expect(declarations(".git-graph-bridge")).toContain("margin: -1px 0");
    expect(declarations(".git-commit-files")).toContain("padding: 3px 4px 4px");
    expect(declarations(".git-commit-files,\n.git-commit-files-state")).toContain("background: transparent");
    expect(declarations(".git-commit-files,\n.git-commit-files-state")).not.toContain("min-height:");
    expect(declarations(".git-commit-files,\n.git-commit-files-state")).not.toContain("max-height:");
    expect(declarations(".git-commit-files-state")).not.toContain("min-height:");
    expect(declarations(".git-commit-files-state")).not.toContain("max-height:");
    const filePanel = declarations(".git-commit-file-panel");
    expect(filePanel).toContain("opacity: 0");
    expect(filePanel).toContain("transform: translateY(-3px)");
    expect(filePanel).toContain("transition: opacity 160ms ease-out, transform 180ms cubic-bezier(.22, 1, .36, 1)");
    const expandedFilePanel = declarations(".git-commit-details-shell.expanded .git-commit-file-panel");
    expect(expandedFilePanel).toContain("opacity: 1");
    expect(expandedFilePanel).toContain("transform: none");
    expect(declarations(".git-commit-file-row")).toContain("min-height: 25px");
    expect(declarations(".git-commit-file-row")).toContain("border-radius: 4px");
    expect(declarations(".git-commit-file-row > svg")).toContain("color: var(--accent)");
    expect(declarations(".git-commit-file-path > span:first-child")).toContain("color: var(--text)");
    expect(declarations('.git-commit-file-status[data-tone="deleted"],\n.git-commit-file-status[data-tone="conflict"]')).toContain("var(--danger)");
    expect(declarations('.git-commit-row[aria-expanded="true"] .git-commit-expander svg')).toContain("rotate(0)");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".git-commit-details-shell");
    expect(reducedMotion).toContain("transition: none");
    expect(reducedMotion).toContain(".git-commit-file-panel");
    expect(reducedMotion).toContain("transform: none");
  });

  it("uses the theme accent for change-file icons and file-browser-strength text", () => {
    expect(declarations(".git-change-row > svg")).toContain("color: var(--accent)");
    const path = declarations(".git-change-path");
    expect(path).toContain("color: var(--text)");
    expect(path).toContain("font-weight: 600");
  });

  it("uses semantic menu roles and a stable source card for commit branch creation", () => {
    const menu = declarations(".git-commit-context-menu");
    expect(menu).toContain("position: fixed");
    expect(menu).toContain("background: var(--floating-material)");
    expect(menu).toContain("border-color: var(--floating-border)");
    expect(declarations(".git-commit-context-heading")).toContain("min-width: 0");
    expect(declarations(".git-commit-context-menu .git-repository-action-item")).toContain("color: var(--menu-text)");
    const disabled = declarations(".git-commit-context-menu .git-repository-action-item:disabled");
    expect(disabled).toContain("color: var(--menu-disabled-text)");
    expect(disabled).toContain("opacity: 1");
    const source = declarations(".git-commit-branch-source");
    expect(source).toContain("display: grid");
    expect(source).toContain("background: color-mix(in srgb, var(--raised) 62%, transparent)");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(declarations(".git-branch-create-feedback")).toContain("min-height: 12px");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".git-repository-popover");
  });
});
