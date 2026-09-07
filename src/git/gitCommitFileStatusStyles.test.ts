// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/git/styles/gitCommitFileStatus.css", "utf8").replace(/\r\n/g, "\n");

function declarations(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const open = styles.indexOf("{", start);
  const close = styles.indexOf("}", open);
  return styles.slice(open + 1, close).replace(/\s+/g, " ");
}

describe("Git commit file status style contracts", () => {
  it("uses the same three semantic colors as the working-tree change list", () => {
    expect(declarations('.git-commit-file-status[data-tone="added"],\n.git-commit-file-status[data-tone="untracked"]')).toContain("color: var(--accent)");
    expect(declarations('.git-commit-file-status[data-tone="modified"],\n.git-commit-file-status[data-tone="renamed"],\n.git-commit-file-status[data-tone="copied"],\n.git-commit-file-status[data-tone="default"]')).toContain("color: var(--warning)");
    expect(declarations('.git-commit-file-status[data-tone="deleted"],\n.git-commit-file-status[data-tone="conflict"]')).toContain("color: var(--danger)");
  });

  it("strikes only the filename of a deleted commit file", () => {
    const path = declarations('.git-commit-file-row[data-status-tone="deleted"] .git-commit-file-path > span:first-child');
    expect(path).toContain("text-decoration-line: line-through");
    expect(path).toContain("text-decoration-color: currentColor");
  });
});
