import { describe, expect, it } from "vitest";

// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";

const styles = readFileSync("src/git/styles/gitTargetConfig.css", "utf8").replace(/\s+/g, " ");

function declarations(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const open = styles.indexOf("{", start);
  const close = styles.indexOf("}", open);
  return styles.slice(open + 1, close);
}

describe("Git remote target recent repository scrolling", () => {
  it("keeps the wrapper content-sized while the real viewport owns overflow", () => {
    const scrollArea = declarations(".git-target-history-scroll-area");
    expect(scrollArea).toContain("min-height: 0");
    expect(scrollArea).toContain("flex: 0 1 auto");
    expect(scrollArea).not.toContain("max-height");

    const viewport = declarations(".git-target-history-scroll");
    expect(viewport).toContain("height: auto");
    expect(viewport).toContain("max-height: 168px");
    expect(viewport).toContain("padding-right: 7px");
    expect(viewport).toContain("overflow-y: auto");
    expect(viewport).not.toContain("scrollbar-width");
    expect(viewport).not.toContain("scrollbar-color");
  });
});
