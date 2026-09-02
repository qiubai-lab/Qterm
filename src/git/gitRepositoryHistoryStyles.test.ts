import { describe, expect, it } from "vitest";

// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";

const styles = ["gitRepositoryHistory.css", "gitMedia.css"]
  .map((file) => readFileSync(`src/git/styles/${file}`, "utf8"))
  .join("\n")
  .replace(/\r\n/g, "\n");

function declarations(selector: string, last = false): string {
  const start = last ? styles.lastIndexOf(`${selector} {`) : styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const open = styles.indexOf("{", start);
  const close = styles.indexOf("}", open);
  return styles.slice(open + 1, close).replace(/\s+/g, " ");
}

describe("Git repository history style contracts", () => {
  it("keeps a bounded themed popover with branch-style item states", () => {
    const popover = declarations(".git-repository-history-popover");
    expect(popover).toContain("position: fixed");
    expect(popover).toContain("z-index: 130");
    expect(popover).toContain("overflow: hidden");
    expect(popover).toContain("background: var(--floating-material)");
    expect(declarations(".git-repository-history-scroll")).toContain("max-height: min(320px, calc(100vh - 132px))");
    expect(declarations(".git-repository-history-scroll")).toContain("overflow-y: auto");
    expect(declarations(".git-repository-history-scroll")).toContain("scrollbar-color: var(--scrollbar-thumb) transparent");
    expect(declarations(".git-repository-history-browse")).toContain("flex: none");

    const itemHover = declarations('.git-repository-history-item:hover,\n.git-repository-history-item[aria-current="true"]');
    expect(itemHover).toContain("background: color-mix(in srgb, var(--primary-action) 11%, var(--raised))");
    expect(itemHover).toContain("border-color: color-mix(in srgb, var(--primary-action) 48%, var(--border))");
    const selectedItem = declarations('.git-repository-history-item[aria-current="true"]', true);
    expect(selectedItem).toContain("border-color: color-mix(in srgb, var(--primary-action) 78%, var(--border))");
    expect(selectedItem).toContain("background: color-mix(in srgb, var(--primary-action) 18%, var(--raised))");
    expect(selectedItem).toContain("inset 0 1px color-mix(in srgb, var(--primary-action) 22%, transparent)");
    expect(declarations('.git-repository-history-item[aria-current="true"]:hover')).toContain("repeating-linear-gradient");
    expect(declarations('.git-repository-history-item:hover > svg,\n.git-repository-history-item:hover strong,\n.git-repository-history-item[aria-current="true"] > svg,\n.git-repository-history-item[aria-current="true"] strong,\n.git-repository-history-item[aria-current="true"] em')).toContain("color: var(--primary-action)");
    expect(declarations(".git-repository-history-item:focus-visible")).toContain("outline: 2px solid var(--focus)");

    const browseHover = declarations(".git-repository-history-browse:hover,\n.git-repository-history-browse:focus-visible");
    expect(browseHover).toContain("background: var(--file-active-surface)");
    expect(browseHover).toContain("var(--file-active-marker)");
    expect(declarations(".git-repository-history-browse:hover > svg,\n.git-repository-history-browse:focus-visible > svg")).toContain("color: var(--file-active-marker)");
    const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".git-repository-history-popover");
  });
});
