import { describe, expect, it } from "vitest";

// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";
const gitStyleFiles = [
  "gitShell.css",
  "gitRepositoryTree.css",
  "gitChangeSelection.css",
  "gitChangeList.css",
  "gitGraph.css",
  "gitTargetConfig.css",
  "gitBranchOverlays.css",
  "gitMergeOverlays.css",
  "gitOperationOverlay.css",
  "gitRepositoryPicker.css",
  "gitRepositoryHistory.css",
  "gitRemoteConfigurationHint.css",
  "gitConflictResolver.css",
  "gitChangePreview.css",
  "gitRefresh.css",
  "gitMedia.css",
] as const;
const gitStyleManifest = readFileSync("src/git/git.css", "utf8").replace(/\r\n/g, "\n");
const styles = gitStyleFiles
  .map((file) => readFileSync(`src/git/styles/${file}`, "utf8"))
  .join("\n")
  .replace(/\r\n/g, "\n");
const cyberTheme = readFileSync("src/app/styles/themes/cyberpunk.css", "utf8").replace(/\r\n/g, "\n");
const fileBrowserStyles = readFileSync("src/files/fileBrowser.css", "utf8").replace(/\r\n/g, "\n");
const conflictStyles = readFileSync("src/git/styles/gitConflictResolver.css", "utf8").replace(/\s+/g, "");
const changePreviewStyles = readFileSync("src/git/styles/gitChangePreview.css", "utf8").replace(/\s+/g, "");

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

  it("keeps virtual Git change rows in a fixed-height positioning canvas", () => {
    expect(declarations(".git-change-list.virtualized")).toContain("position: relative");
    expect(declarations(".git-change-list.virtualized")).toContain("overflow: hidden");
    const row = declarations(".git-change-list.virtualized .git-change-row");
    expect(row).toContain("position: absolute");
    expect(row).toContain("inset: 0 0 auto");
  });

  it("gives the repository picker one bounded directory scroller", () => {
    const dialog = declarations(".dialog-frame.git-repository-picker-dialog");
    expect(dialog).toContain("width: min(925px, calc(100vw - 48px))");
    expect(dialog).toContain("height: min(470px, calc(100vh - 48px))");
    expect(declarations(".git-repository-picker-dialog .dialog-content")).toContain("display: flex");
    expect(declarations(".git-repository-picker-dialog .dialog-content")).toContain("min-height: 0");
    expect(declarations(".git-repository-picker-dialog .dialog-content")).toContain("overflow: hidden");
    expect(declarations(".git-repository-picker")).toContain("min-height: 0");
    expect(declarations(".git-repository-picker")).toContain("flex: 1");
    const toolbar = declarations(".git-repository-picker-toolbar");
    expect(toolbar).toContain("flex: none");
    expect(toolbar).toContain("grid-template-columns: 27px 27px minmax(0, 1fr) 27px");
    expect(declarations(".git-repository-picker-toolbar > button")).toContain("width: 27px");
    const pathShell = declarations(".git-repository-picker-path-shell");
    expect(pathShell).toContain("min-width: 0");
    expect(pathShell).toContain("height: 27px");
    expect(pathShell).not.toContain("border:");
    expect(pathShell).not.toContain("background:");
    expect(pathShell).not.toContain("box-shadow:");
    expect(declarations(".git-repository-picker-path > .sr-only")).toContain("clip: rect(0, 0, 0, 0)");
    const pathForm = declarations(".git-repository-picker-path");
    expect(pathForm).toContain("height: 27px");
    expect(pathForm).toContain("margin: 0");
    expect(pathForm).toContain("align-items: center");
    const pathInput = declarations(".git-repository-picker-path input");
    expect(pathInput).toContain("width: 0");
    expect(pathInput).toContain("height: 20px");
    expect(pathInput).toContain("border: 0");
    expect(pathInput).toContain("border-radius: 0");
    expect(pathInput).toContain("background: transparent");
    expect(pathInput).toContain("box-shadow: inset 0 -1px 0 var(--focus)");
    expect(declarations(".git-repository-picker-path input:focus,\n.git-repository-picker-path input:focus-visible")).toContain("box-shadow: inset 0 -1px 0 var(--focus)");
    expect(declarations(".git-repository-picker-path-display")).toContain("text-overflow: ellipsis");
    expect(declarations(".git-repository-picker-directory-stage")).toContain("min-height: 0");
    expect(declarations(".git-repository-picker-directory-stage")).toContain("flex: 1");
    const columns = declarations(".git-repository-picker-columns,\n.git-repository-picker-row-shell button");
    expect(columns).toContain("grid-template-columns: minmax(0, 1fr) 112px 168px");
    expect(declarations(".git-repository-picker-columns > span:not(:first-child)")).toContain("text-align: center");
    expect(declarations(".git-repository-picker-permission,\n.git-repository-picker-type,\n.git-repository-picker-time")).toContain("text-align: center");
    const narrowPicker = styles.slice(styles.indexOf("@media (max-width: 520px)"), styles.indexOf("@media (max-width: 620px)"));
    expect(narrowPicker).not.toContain("grid-template-columns:");
    expect(declarations(".git-repository-picker-list-scroll")).toContain("min-height: 0");
    expect(declarations(".git-repository-picker-list-scroll")).toContain("flex: 1");
    expect(declarations(".git-repository-picker-list-scroll")).toContain("overflow: auto");
    expect(declarations(".git-repository-picker-list-scroll")).toContain("scrollbar-color: var(--scrollbar-thumb) transparent");
    expect(declarations(".git-repository-picker-feedback")).toContain("min-height: 34px");
    expect(declarations(".git-repository-picker-footer")).toContain("min-height: 58px");
    expect(declarations(".git-repository-picker-footer .ui-button")).toContain("height: 30px");
    expect(declarations(".git-repository-picker-footer .ui-button--primary")).toContain("min-width: 100px");
    expect(cyberTheme).toContain("--danger:#ff6b75");
    const selectedRow = declarations(".git-repository-picker-row-shell button[data-selected],\n.git-repository-picker-row-shell button[data-selected]:hover");
    expect(selectedRow).toContain("background: var(--file-selection-surface)");
    expect(selectedRow).toContain("inset 0 0 0 1px var(--file-selection-marker)");
    expect(declarations(".git-repository-picker-name > svg")).toContain("color: var(--accent)");
    expect(declarations(".git-repository-picker-row-shell button:hover .git-repository-picker-name > svg")).toContain("color: var(--file-active-marker)");
    expect(declarations(".git-repository-picker-row-shell button[data-selected] .git-repository-picker-name > svg,\n.git-repository-picker-row-shell button[data-selected]:hover .git-repository-picker-name > svg")).toContain("color: var(--file-selection-marker)");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".git-repository-picker-row-shell button");
  });

  it("groups the remote target path and browse action into one focus surface", () => {
    const group = declarations(".git-target-path-group");
    expect(group).toContain("display: flex");
    expect(group).toContain("height: 32px");
    expect(group).toContain("overflow: hidden");
    expect(declarations(".git-target-path-group:focus-within")).toContain("border-color: var(--focus)");
    const input = declarations(".git-target-path-group input");
    expect(input).toContain("appearance: none");
    expect(input).toContain("padding: 7px 8px");
    expect(input).toContain("line-height: 16px");
    expect(input).not.toContain("transform:");
    const browse = declarations(".git-target-browse");
    expect(browse).toContain("border-left: 1px solid var(--border)");
    expect(browse).toContain("color: var(--primary-action-contrast)");
    expect(browse).toContain("background: var(--primary-action)");
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
    expect(declarations(".git-section-meta")).toContain("color: var(--muted)");
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
    expect(declarations(".git-primary-action")).toContain("width: 100%");
    expect(declarations(".git-primary-action")).toContain("justify-content: center");
    expect(declarations(".git-primary-action")).toContain("border: 1px solid color-mix(in srgb, var(--primary-action) 86%, var(--border))");
    expect(declarations(".git-primary-action")).toContain("color: var(--primary-action-contrast)");
    expect(declarations(".git-primary-action")).toContain("background: var(--primary-action)");
    expect(declarations(".git-primary-action")).toContain("font-size: 10.5px");
    expect(declarations(".git-primary-action")).toContain("font-weight: 700");
    expect(declarations(".git-primary-action")).toContain("letter-spacing: .04em");
    expect(declarations(".git-primary-action:hover:not(:disabled),\n.git-primary-action-toggle:hover:not(:disabled)")).toContain("background: color-mix(in srgb, var(--primary-action) 88%, var(--text))");
    expect(styles).not.toContain(".git-primary-action kbd");
    expect(declarations(".git-commit-box textarea:focus-visible")).toContain("outline: none");
    expect(declarations(".git-commit-box textarea:focus-visible")).toContain("border-color: var(--focus)");
    expect(cyberTheme).toContain("--primary-action:#fcee0a");
    expect(styles).not.toContain("git-commit-button");
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

  it("highlights only the repository name while refreshing", () => {
    const name = declarations('.git-repository-name[data-updating="true"]');
    expect(name).toContain("color: var(--block-border-active)");
    expect(name).toContain("animation: git-repository-refresh-name-breathe 1600ms ease-in-out infinite");
    expect(styles).not.toContain("git-repository-refresh-card-breathe");
    expect(styles).not.toContain('.git-repository-card[data-updating="true"]');
    expect(styles).toContain("@keyframes git-repository-refresh-name-breathe");
    expect(cyberTheme).toContain("--block-border-active:#fcee0a");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toMatch(/\.git-repository-name\[data-updating="true"\] \{[\s\S]*?animation: none;[\s\S]*?text-shadow: none;/);
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

  it("aligns independent change cards with the commit card without a reserved scrollbar gutter", () => {
    const changes = declarations(".git-change-scroll");
    expect(declarations(".git-commit-box")).toContain("margin: 7px 8px 5px");
    expect(changes).toContain("margin: 0 8px 7px");
    expect(changes).toContain("padding: 0");
    expect(changes).toContain("background: transparent");
    expect(changes).not.toContain("scrollbar-gutter: stable");
    expect(changes).not.toContain("border:");
    expect(changes).not.toContain("box-shadow:");
    expect(declarations(".git-change-scroll > .git-clean-state:only-child")).toContain("flex: 1");
    const group = declarations(".git-change-group");
    expect(group).toContain("border: 1px solid");
    expect(group).toContain("border-radius: 5px");
    expect(group).toContain("background:");
  });

  it("uses a stable semantic merge state bar with restrained attention and explicit actions", () => {
    const mergeState = declarations(".git-merge-state");
    expect(mergeState).toContain("display: grid");
    expect(mergeState).toContain("border: 1px solid color-mix(in srgb, var(--danger)");
    expect(mergeState).toContain("background: color-mix(in srgb, var(--danger-bg)");
    expect(mergeState).toContain("color: var(--text)");
    expect(declarations(".git-merge-state-copy")).toContain("min-width: 0");
    expect(declarations(".git-merge-state-actions")).toContain("display: flex");
    expect(declarations(".git-merge-state-actions .danger")).toContain("color: var(--danger)");
    expect(declarations('.git-operation-row[data-status="attention"] .git-operation-status')).toContain("color: var(--warning)");
    expect(mergeState).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("uses an icon-and-text branch trigger and portaled floating layers", () => {
    expect(declarations(".git-repository-node-controls,\n.git-repository-tree-actions")).toContain("display: flex");
    expect(declarations(".git-repository-node-controls,\n.git-repository-tree-actions")).toContain("gap: 3px");
    expect(declarations(".git-repository-treeitem")).toContain('grid-template-areas: "leading select actions"');
    expect(declarations(".git-repository-tree")).toContain("gap: var(--git-repository-row-gap)");
    expect(declarations('.git-repository-treeitem[data-depth="0"]')).toContain('grid-template-areas: "select actions"');
    expect(declarations(".git-repository-tree-leading > svg")).toContain("color: color-mix(in srgb, var(--accent) 58%, var(--dim))");
    expect(declarations(".git-repository-tree-leading > svg")).toContain("opacity: .76");
    expect(styles).not.toContain(".git-repository-tree-branch");
    expect(styles).toContain('.git-repository-treeitem[data-density="2"] .git-repository-sync');
    expect(declarations('.git-repository-treeitem[data-depth="0"] .git-repository-tree-select')).toContain("padding-left: 8px");
    const repositorySelection = declarations(".git-repository-selection-indicator");
    expect(repositorySelection).toContain("position: absolute");
    expect(repositorySelection).toContain("height: calc(var(--git-repository-row-height) - 2px)");
    expect(repositorySelection).toContain("transform: translateY(calc(var(--git-repository-selected-index)");
    expect(repositorySelection).toContain("transition: transform 180ms cubic-bezier(.22, 1, .36, 1)");
    expect(declarations('.git-repository-treeitem[data-selected="true"] .git-repository-tree-copy strong')).toContain("color: var(--primary-action)");
    expect(styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"))).toContain(".git-repository-selection-indicator");
    expect(declarations(".git-repository-status-group")).toContain("display: inline-flex");
    expect(declarations(".git-repository-status-group")).toContain("color: var(--accent)");
    expect(declarations(".git-repository-status-group")).toContain("background: color-mix(in srgb, var(--accent) 9%, transparent)");
    expect(declarations(".git-repository-status-group .git-repository-sync")).toContain("border-left: 1px solid");
    expect(declarations(".git-branch-trigger")).toContain("display: flex");
    expect(declarations(".git-branch-trigger")).toContain("width: max-content");
    expect(declarations(".git-branch-trigger")).toContain("height: 19px");
    expect(declarations(".git-repository-sync")).toContain("height: 19px");
    expect(declarations(".git-branch-trigger")).toContain("background: var(--primary-action)");
    expect(declarations(".git-branch-trigger")).toContain("color: var(--primary-action-contrast)");
    expect(declarations(".git-branch-trigger svg")).toContain("color: currentColor");
    expect(styles).not.toContain(".git-repository-row");
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
    expect(declarations('.git-primary-action[data-updating="true"] > svg')).toContain("animation: git-repository-picker-spin 700ms linear infinite");
    expect(declarations('.git-primary-action[data-updating="true"]:disabled')).toContain("color: var(--primary-action)");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain('.git-repository-refresh[data-updating="true"] svg');
    expect(reducedMotion).toContain('.git-primary-action[data-updating="true"] > svg');
    expect(reducedMotion).toContain(".git-merge-flow-packet");
  });

  it("uses themed danger feedback and a floating explanation when remote configuration is missing", () => {
    const primary = declarations('.git-primary-action[data-remote-configuration-required="true"]');
    expect(primary).toContain("border-color: color-mix(in srgb, var(--danger)");
    expect(primary).toContain("color: var(--danger)");
    expect(declarations('.git-repository-action-item[data-remote-configuration-required="true"]')).toContain("color: var(--danger)");
    const tooltip = declarations(".git-remote-configuration-tooltip");
    expect(tooltip).toContain("position: fixed");
    expect(tooltip).toContain("z-index: 170");
    expect(tooltip).toContain("background: var(--floating-material)");
    expect(tooltip).toContain("pointer-events: none");
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
    expect(declarations(".git-commit-file-row")).toContain("width: 100%");
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
    expect(path).toContain("justify-self: start");
    expect(declarations(".git-change-row.previewable")).toContain("grid-template-columns: minmax(0, 1fr) auto");
    const previewTrigger = declarations(".git-change-row > .git-change-preview-trigger");
    expect(previewTrigger).toContain("width: 100%");
    expect(previewTrigger).toContain("grid-template-columns: auto minmax(0, 1fr) auto");
    const hover = declarations(".git-change-row:hover");
    expect(hover).toContain("background: var(--file-active-surface)");
    expect(hover).toContain("var(--file-active-marker)");
    const selected = declarations('.git-change-row.previewable[data-selected="true"]');
    expect(selected).toContain("border-radius: 4px");
    expect(selected).toContain("background: var(--file-selection-surface)");
    expect(selected).toContain("box-shadow: inset 0 0 0 1px var(--file-selection-marker)");
    const selectedTriggerHover = declarations('.git-change-row.previewable[data-selected="true"] > .git-change-preview-trigger:hover:not(:disabled),\n.git-change-row.previewable[data-selected="true"] > .git-change-preview-trigger:active:not(:disabled)');
    expect(selectedTriggerHover).toContain("border-color: transparent");
    expect(selectedTriggerHover).toContain("background: transparent");
    const selectionHint = declarations(".git-change-selection-hint");
    expect(selectionHint).toContain("position: fixed");
    expect(selectionHint).toContain("border: 1px solid var(--floating-border)");
    expect(selectionHint).toContain("background: var(--floating-material)");
    expect(selectionHint).toContain("pointer-events: none");
    expect(declarations('.git-change-row.previewable[data-selected="true"] .git-change-path')).toContain("color: var(--file-selection-foreground)");
    expect(declarations('.git-change-row.previewable[data-selected="true"] .git-change-preview-trigger > svg')).toContain("color: var(--file-selection-marker)");
    expect(declarations('.git-change-row.previewable[data-selected="true"] .git-change-status')).toContain("color: var(--file-selection-secondary-foreground)");
  });

  it("uses the shared themed popover surface for change context actions", () => {
    expect(declarations(".git-change-context-menu")).toContain("width: 210px");
    expect(styles).not.toContain(".git-discard-context-menu");
    expect(declarations(".git-commit-context-menu")).toContain("background: var(--floating-material)");
  });

  it("keeps translated Git status labels on one compact line", () => {
    expect(declarations(".git-change-status")).toContain("white-space: nowrap");
    expect(declarations(".git-change-preview-status")).toContain("flex: none");
    expect(declarations(".git-change-preview-status")).toContain("white-space: nowrap");
    expect(declarations(".git-change-preview-file-list button b")).toContain("white-space: nowrap");
    expect(declarations(".git-commit-file-status")).toContain("flex: none");
    expect(declarations(".git-commit-file-status")).toContain("white-space: nowrap");
  });

  it("lets discard confirmation content use the dialog width", () => {
    expect(declarations(".dialog-frame.git-discard-confirmation")).toContain("width: min(410px, calc(100vw - 40px))");
    const content = declarations(".git-discard-confirmation .dialog-content");
    expect(content).toContain("width: 100%");
    expect(content).toContain("padding: 0");
    expect(content).toContain("align-items: stretch");
    expect(declarations(".git-discard-confirmation-body")).toContain("width: 100%");
    expect(declarations(".git-discard-confirmation .dialog-actions")).toContain("width: 100%");
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

  it("keeps the aggregate Git action compact, semantic, and motion-safe", () => {
    const split = declarations(".git-primary-action-split");
    expect(split).toContain("display: grid");
    expect(split).toContain("min-width: 0");
    expect(split).toContain("grid-template-columns: minmax(0, 1fr) auto");
    const primary = declarations(".git-primary-action");
    expect(primary).toContain("background: var(--primary-action)");
    expect(primary).toContain("color: var(--primary-action-contrast)");
    const menu = declarations(".git-primary-action-menu");
    expect(menu).toContain("position: fixed");
    expect(menu).toContain("background: var(--floating-material)");
    expect(menu).toContain("border-color: var(--floating-border)");
    expect(declarations(".git-primary-action-menu [role=\"menuitem\"]")).toContain("color: var(--menu-text)");
    const disabled = declarations(".git-primary-action:disabled");
    expect(disabled).toContain("opacity: 1");
    expect(disabled).toContain("color: var(--menu-disabled-text)");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".git-primary-action-menu");
  });

  it("gives the conflict manager bounded independent scrollers and semantic focus states", () => {
    expect(conflictStyles).toMatch(/^\.dialog-frame\.dialog-wide\.git-conflict-dialog\{width:min\(1480px,100%\);max-width:100%;height:min\(920px,100%\);max-height:100%\}/);
    expect(conflictStyles).toContain(".git-conflict-dialog>.dialog-content{display:flex;min-width:0;min-height:0;flex:1;");
    expect(conflictStyles).toContain(".git-conflict-manager{display:flex;min-width:0;min-height:0;flex:1;overflow:hidden}");
    expect(conflictStyles).toContain(".git-conflict-sidebar{position:relative;display:flex;min-width:0;min-height:0;flex:0034px;");
    expect(conflictStyles).toContain("overflow:visible");
    expect(conflictStyles).not.toContain("flex-basis:");
    expect(conflictStyles).toContain(".git-conflict-editor{display:grid;min-width:0;min-height:0;flex:110;");
    expect(conflictStyles).toContain(".git-conflict-file-popover{position:absolute;z-index:5;top:0;bottom:0;left:34px;width:min(220px,calc(100vw-82px));");
    expect(conflictStyles).toContain("transform-origin:lefttop;opacity:0;transform:translateX(-8px)scale(.985);visibility:hidden;pointer-events:none;");
    expect(conflictStyles).toContain('.git-conflict-file-popover[data-open="true"]{opacity:1;transform:none;visibility:visible;pointer-events:auto;transition-delay:0s}');
    expect(conflictStyles).toContain(".git-conflict-list{min-height:0;flex:1;overflow:auto");
    expect(conflictStyles).toContain(".git-conflict-dialog.cm-editor{font-size:11px;line-height:1.45}");
    expect(conflictStyles).toContain(".git-conflict-inputs{display:grid;min-width:0;min-height:0;grid-template-columns:repeat(2,minmax(0,1fr));");
    expect(conflictStyles).toContain(".git-conflict-result{display:flex;min-width:0;min-height:0;overflow:hidden}");
    expect(conflictStyles).toContain(".git-conflict-actions{display:grid;");
    expect(conflictStyles).toContain(".git-conflict-sidebar-toggle:focus-visible,.git-conflict-item:focus-visible,.git-conflict-base-toggle:focus-visible,.git-conflict-nav-button:focus-visible{outline:2pxsolidvar(--focus)");
    expect(conflictStyles).toContain(".git-conflict-comparison.cm-activeLineGutter{background:transparent;box-shadow:none}");
    expect(conflictStyles).toContain(".git-conflict-result.cm-activeLineGutter{color:var(--editor-gutter-foreground);box-shadow:none}");
    expect(conflictStyles).toContain(".git-conflict-result.cm-git-conflict-current,.git-conflict-result.cm-git-conflict-incoming,.git-conflict-result.cm-git-conflict-active{box-shadow:none}");
    expect(conflictStyles).toContain("@media(max-width:820px)");
    expect(conflictStyles).toContain("@media(prefers-reduced-motion:reduce)");
    expect(conflictStyles).toContain(".git-conflict-file-popover{transition:opacity.1sease-out;transform:none}");
    expect(conflictStyles).toContain("@media(prefers-reduced-transparency:reduce)");
    expect(conflictStyles).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("keeps change preview viewport-safe while its file list floats over the editor", () => {
    expect(changePreviewStyles).toContain("width:min(1480px,100%)");
    expect(changePreviewStyles).toContain("max-width:100%");
    expect(changePreviewStyles).toContain("height:min(920px,100%)");
    expect(changePreviewStyles).toContain("max-height:100%");
    expect(changePreviewStyles).not.toContain("calc(100vw-48px)");
    expect(changePreviewStyles).not.toContain("calc(100vh-48px)");
    expect(changePreviewStyles).toContain(".git-change-preview-dialog.dialog-content{display:flex;flex:110;min-width:0;min-height:0");
    expect(changePreviewStyles).toContain(".git-change-preview-stage{position:relative");
    expect(changePreviewStyles).toContain("flex:110;min-width:0;min-height:0;overflow:hidden");
    expect(changePreviewStyles).toContain(".git-change-preview-file-popover{position:absolute");
    expect(changePreviewStyles).toContain("flex-direction:column");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-mergeView{height:100%");
    expect(changePreviewStyles).toContain("overflow-y:auto");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-mergeViewEditors{flex:none;min-height:100%;width:100%");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-mergeView,.git-change-comparison.cm-mergeViewEditors{background:var(--editor-background)");
    const sourceHeadings = declarations(".git-change-preview-source-headings");
    expect(sourceHeadings).toContain("grid-template-columns: 1fr 1fr");
    expect(sourceHeadings).toContain("min-width: 0");
    const sourceHeading = declarations(".git-change-preview-source-headings span");
    expect(sourceHeading).toContain("min-width: 0");
    expect(sourceHeading).toContain("overflow: hidden");
    expect(sourceHeading).toContain("text-overflow: ellipsis");
    expect(sourceHeading).toContain("white-space: nowrap");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-mergeViewEditor{--git-diff-gutter-width:0px;min-height:100%");
    expect(changePreviewStyles).toContain("background:linear-gradient(toright,var(--editor-gutter-background)0calc(var(--git-diff-gutter-width)-1px),var(--editor-border)calc(var(--git-diff-gutter-width)-1px)var(--git-diff-gutter-width),var(--editor-background)var(--git-diff-gutter-width))");
    expect(changePreviewStyles).toContain("min-height:100%;height:max-content;overflow-x:hidden;overflow-y:clip");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-lineWrapping.cm-content{min-width:0;width:100%;white-space:pre-wrap;overflow-wrap:anywhere");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-mergeViewEditor.cm-editor{flex:none;width:100%;min-height:100%;height:auto!important");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-mergeView.cm-editor.cm-scroller{min-height:100%;height:auto!important;overflow:visible!important");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-mergeSpacer{background:repeating-linear-gradient");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-cursorLayer,.git-change-comparison.cm-dropCursor{display:none");
    expect(changePreviewStyles).toContain(".git-diff-overview{position:absolute");
    expect(changePreviewStyles).toContain("background:color-mix(insrgb,var(--scrollbar-track)72%,transparent)");
    expect(changePreviewStyles).toContain(".git-diff-overview-viewport{z-index:1");
    expect(changePreviewStyles).toContain("background:color-mix(insrgb,var(--scrollbar-thumb)38%,transparent)");
    expect(changePreviewStyles).toContain("color-mix(insrgb,var(--scrollbar-thumb)82%,var(--accent))");
    expect(changePreviewStyles).toContain('.git-diff-overview-marker[data-kind="deletion"]');
    expect(changePreviewStyles).toContain('.git-diff-overview-marker[data-kind="addition"]');
    expect(changePreviewStyles).toContain("pointer-events:none");
    expect(changePreviewStyles).toContain(".git-change-preview-file-popover[data-open]{opacity:1;pointer-events:auto;transform:translateX(0)scale(1)");
    const narrowPreview = changePreviewStyles.slice(changePreviewStyles.indexOf("@media(max-width:720px)"), changePreviewStyles.indexOf("@media(prefers-reduced-motion:reduce)"));
    expect(narrowPreview).not.toContain(".git-change-preview-source-headings");
    expect(narrowPreview).toContain(".git-change-preview-fallback{grid-template-columns:1fr");
    expect(changePreviewStyles).toContain("@media(prefers-reduced-motion:reduce)");
    expect(changePreviewStyles).toContain("@media(prefers-reduced-transparency:reduce)");
    expect(changePreviewStyles).toContain("@media(prefers-contrast:more)");
  });

  it("uses themed, frameless file and navigation affordances in change preview", () => {
    expect(changePreviewStyles).toContain(".git-change-preview-files-toggle{color:var(--primary-action);background:transparent");
    expect(changePreviewStyles).toContain(".git-change-preview-files-toggle>svg{animation:git-change-preview-files-attention");
    expect(changePreviewStyles).toContain(".git-change-preview-navigationbutton{border:0;color:var(--muted);background:transparent");
    expect(changePreviewStyles).toContain(".git-change-preview-navigationbutton:hover:not(:disabled),.git-change-preview-navigationbutton:focus-visible{color:var(--primary-action)");
    expect(changePreviewStyles).toContain(".git-change-preview-counter-current{color:var(--text-strong)");
    expect(changePreviewStyles).toContain(".git-change-preview-counter-total{color:var(--text)");
    const reducedMotion = changePreviewStyles.slice(changePreviewStyles.indexOf("@media(prefers-reduced-motion:reduce)"));
    expect(reducedMotion).toContain(".git-change-preview-files-toggle>svg");
    expect(reducedMotion).toContain("animation:none");
  });

  it("uses the diff overview as the sole scrollbar while wrapped editors avoid horizontal scrolling", () => {
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-mergeView{height:100%;box-sizing:border-box;padding-right:12px");
    expect(changePreviewStyles).toContain("scrollbar-width:none");
    expect(changePreviewStyles).toContain(".git-change-comparison.cm-mergeView::-webkit-scrollbar{width:0;height:0");
    expect(changePreviewStyles).not.toContain(".git-change-comparison.cm-mergeViewEditor::-webkit-scrollbar");
    expect(changePreviewStyles).toContain(".git-diff-overview{position:absolute;z-index:3;top:0;right:1px;bottom:0");
    expect(changePreviewStyles).toContain("box-shadow:inset0001px");
    expect(changePreviewStyles).toContain(".git-diff-overview-viewport{z-index:1;right:0;left:0;box-sizing:border-box");
  });
});
