import { describe, expect, it } from "vitest";

// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";

const styles = readFileSync("src/git/styles/gitBranchOverlays.css", "utf8").replace(/\s+/g, " ");

function declarations(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const open = styles.indexOf("{", start);
  const close = styles.indexOf("}", open);
  return styles.slice(open + 1, close);
}

describe("Git branch overlay scrolling", () => {
  it("keeps the content-sized wrapper shrinkable while the viewport owns the height limit", () => {
    const scrollArea = declarations(".git-branch-list-scroll-area");
    expect(scrollArea).toContain("min-height: 0");
    expect(scrollArea).toContain("flex: 0 1 auto");
    expect(scrollArea).not.toContain("max-height");

    const viewport = declarations(".git-branch-list");
    expect(viewport).toContain("height: auto");
    expect(viewport).toContain("max-height: min(280px, calc(100vh - 120px))");
    expect(viewport).toContain("overflow-y: auto");
  });
});
