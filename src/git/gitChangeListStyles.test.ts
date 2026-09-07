// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/git/styles/gitChangeList.css", "utf8").replace(/\r\n/g, "\n");

function declarations(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const open = styles.indexOf("{", start);
  const close = styles.indexOf("}", open);
  return styles.slice(open + 1, close).replace(/\s+/g, " ");
}

describe("Git change list style contracts", () => {
  it("distinguishes deleted changes with danger text and a struck path", () => {
    const path = declarations('.git-change-row[data-status-tone="deleted"] .git-change-path');
    expect(path).toContain("text-decoration-line: line-through");
    expect(path).toContain("text-decoration-color: currentColor");

    const status = declarations('.git-change-status[data-tone="deleted"],\n.git-change-row.previewable[data-selected="true"] .git-change-status[data-tone="deleted"]');
    expect(status).toContain("color: var(--danger)");
  });
});
