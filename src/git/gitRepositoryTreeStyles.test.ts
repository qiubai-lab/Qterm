// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/git/styles/gitRepositoryTree.css", "utf8");

describe("repository row layout and interaction styles", () => {
  it("keeps collapsed controls measurable without fixed container cutoffs", () => {
    expect(css).not.toContain("@container");
    expect(css).toMatch(/data-density="3"\] \.git-repository-status-group \{[^}]*position: absolute;[^}]*width: max-content;[^}]*visibility: hidden;/u);
    expect(css).toContain("grid-template-columns: auto minmax(0, 1fr) auto");
  });

  it("does not override the branch button theme highlight with neutral hover colors", () => {
    expect(css).not.toContain(".git-repository-node-controls > button:hover");
    const rule = css.match(/\.git-repository-node-controls > \.git-branch-trigger:is\(:hover, :active, \[aria-expanded="true"\]\):not\(:disabled\) \{([^}]+)\}/u)?.[1];
    expect(rule).toContain("background: var(--primary-action)");
    expect(rule).toContain("box-shadow: 0 0 0 1px var(--git-repository-button-edge)");
    expect(rule).not.toContain("inset");
    expect(rule).not.toMatch(/,\s*0 0/u);
    expect(css).toContain(".git-repository-treeitem button:focus-visible");
  });

  it("defines repository row hover with a crisp full inset edge", () => {
    const hover = css.match(/\.git-repository-treeitem:not\(\[data-selected="true"\]\):hover \{([^}]+)\}/u)?.[1];
    expect(hover).toContain("background: var(--file-active-surface)");
    expect(hover).toContain("box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--file-active-marker) 72%, var(--border))");
    expect(hover).not.toContain("inset 2px 0");
  });

  it("uses stationary edge feedback for hover and press without animating geometry", () => {
    const rest = css.match(/:is\(\.git-repository-node-controls, \.git-repository-tree-actions\) button,\s*\.git-repository-tree-toggle \{([^}]+)\}/u)?.[1];
    expect(rest).toContain("appearance: none");
    expect(rest).toContain("transition: border-color 120ms ease, box-shadow 120ms ease");
    const hover = css.match(/\.git-repository-tree-toggle:is\(:hover, :active\):not\(:disabled\) \{([^}]+)\}/u)?.[1];
    expect(hover).toContain("transform: none");
    expect(hover).toContain("60%, transparent");
    const pressed = css.match(/\.git-repository-node-controls > \.git-branch-trigger:active:not\(:disabled\) \{([^}]+)\}/u)?.[1];
    expect(pressed).toContain("transform: none");
    expect(pressed).toContain("box-shadow: 0 0 0 2px var(--git-repository-button-edge)");
    expect(pressed).toContain("transition: none");
    expect(`${rest}${hover}${pressed}`).not.toMatch(/(?:padding|height|font-size|line-height):|scale\(|translate/iu);
    expect(css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"))).toContain(":is(.git-repository-node-controls, .git-repository-tree-actions) button");
  });

  it("places filled branch feedback outside the fill with an immediate stronger press", () => {
    const rest = css.match(/\.git-repository-node-controls > \.git-branch-trigger \{([^}]+)\}/u)?.[1];
    expect(rest).toContain("--git-repository-button-edge: var(--primary-action)");
    expect(rest).toContain("box-shadow: none");
    const hover = css.match(/\.git-repository-node-controls > \.git-branch-trigger:is\(:hover, :active, \[aria-expanded="true"\]\):not\(:disabled\) \{([^}]+)\}/u)?.[1];
    expect(hover).toContain("border-color: var(--primary-action)");
    expect(hover).toContain("box-shadow: 0 0 0 1px var(--git-repository-button-edge)");
    expect(hover).not.toContain("inset");
  });
});
