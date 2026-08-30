import { describe, expect, it } from "vitest";

// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";

const styles = readFileSync("src/git/git.css", "utf8");
const cyberTheme = readFileSync("src/app/styles/themes/cyberpunk.css", "utf8");

function declarations(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const open = styles.indexOf("{", start);
  const close = styles.indexOf("}", open);
  return styles.slice(open + 1, close).replace(/\s+/g, " ");
}

describe("Git pane style contracts", () => {
  it("inherits the terminal workbench background across Git content surfaces", () => {
    expect(declarations(".git-block")).toContain("background: var(--workbench-panel)");
    expect(declarations(".git-pane")).toContain("background: transparent");
    expect(styles).toMatch(/\.git-graph-scroll\s*\{[^}]*background:\s*transparent;/);
  });

  it("keeps visual position independent from collapsed state", () => {
    expect(declarations(".git-pane")).toContain("display: flex");
    expect(declarations(".git-pane")).toContain("flex-direction: column");
    expect(declarations(".git-repository-section")).not.toContain("order:");
    expect(declarations(".git-changes-section")).not.toContain("order:");
    expect(declarations(".git-graph-section")).not.toContain("order:");
    expect(declarations(".git-changes-section")).toContain("flex: 1 1 160px");
    expect(declarations(".git-graph-section")).toContain("flex: .75 1 140px");
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

  it("keeps the commit composer vertical and gives the graph its own visual rail", () => {
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
    expect(styles).toMatch(/\.git-graph-scroll\s*\{\s*position:\s*relative;\s*padding:\s*0;/);
    expect(declarations(".git-graph-rail")).toContain("border-right:");
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

  it("uses an icon-and-text branch trigger and portaled floating layers", () => {
    expect(declarations(".git-repository-actions")).toContain("display: flex");
    expect(declarations(".git-repository-actions")).toContain("gap: 2px");
    expect(declarations(".git-branch-trigger")).toContain("display: flex");
    expect(declarations(".git-branch-trigger")).toContain("width: max-content");
    expect(declarations(".git-branch-trigger")).toContain("background: var(--primary-action)");
    expect(declarations(".git-branch-trigger")).toContain("color: var(--primary-action-contrast)");
    expect(declarations(".git-branch-trigger svg")).toContain("color: currentColor");
    expect(styles).not.toContain(".git-repository-row select");
    const popover = declarations(".git-repository-popover");
    expect(popover).toContain("position: fixed");
    expect(popover).toContain("z-index: 130");
    expect(popover).toContain("background: var(--floating-material)");
    expect(declarations(".git-branch-popover")).toContain("width: 336px");
    expect(declarations(".git-branch-popover")).toContain("padding: 0");
    expect(declarations(".git-branch-list")).toContain("width: 100%");
    expect(declarations(".git-branch-list")).toContain("gap: 3px");
    expect(declarations(".git-branch-list")).toContain("padding: 4px");
    expect(declarations(".git-branch-list")).toContain("scrollbar-gutter: auto");
    const option = declarations('.git-branch-popover [role="option"]');
    expect(option).toContain("box-sizing: border-box");
    expect(option).toContain("width: 100%");
    expect(option).toContain("border-radius: 6px");
    expect(declarations('.git-branch-popover [role="option"][aria-selected="true"]')).toContain("var(--primary-action)");
    expect(declarations('.git-branch-popover [role="option"][aria-selected="true"]:hover')).toContain("repeating-linear-gradient");
  });

  it("presents graph commits as selectable two-line rows with themed decorations", () => {
    const row = declarations(".git-commit-row");
    expect(row).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(row).toContain("width: 100%");
    expect(declarations('.git-commit-row[aria-pressed="true"]')).toContain("var(--primary-action)");
    expect(declarations(".git-commit-summary")).toContain("display: flex");
    expect(declarations('.git-decorations span[data-kind="head"]')).toContain("var(--primary-action)");
    expect(declarations('.git-decorations span[data-kind="remote"]')).toContain("var(--accent)");
  });

  it("shows lazy commit files as an indented themed continuation of the graph", () => {
    expect(declarations(".git-commit-files")).toContain("padding: 2px 0 3px");
    expect(declarations(".git-commit-files,\n.git-commit-files-state")).toContain("background: var(--surface)");
    expect(declarations(".git-commit-file-row > svg")).toContain("color: var(--accent)");
    expect(declarations(".git-commit-file-path > span:first-child")).toContain("color: var(--text)");
    expect(declarations('.git-commit-file-status[data-tone="deleted"],\n.git-commit-file-status[data-tone="conflict"]')).toContain("var(--danger)");
    expect(declarations('.git-commit-row[aria-expanded="true"] .git-commit-expander svg')).toContain("rotate(0)");
  });

  it("uses the theme accent for change-file icons and file-browser-strength text", () => {
    expect(declarations(".git-change-row > svg")).toContain("color: var(--accent)");
    const path = declarations(".git-change-path");
    expect(path).toContain("color: var(--text)");
    expect(path).toContain("font-weight: 600");
  });
});
