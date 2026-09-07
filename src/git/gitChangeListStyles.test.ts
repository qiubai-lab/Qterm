// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/git/styles/gitChangeList.css", "utf8").replace(/\r\n/g, "\n");
const shellStyles = readFileSync("src/git/styles/gitShell.css", "utf8").replace(/\r\n/g, "\n");

function declarations(selector: string, source = styles): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close).replace(/\s+/g, " ");
}

describe("Git change list style contracts", () => {
  it("distinguishes deleted changes with a struck path", () => {
    const path = declarations('.git-change-row[data-status-tone="deleted"] .git-change-path');
    expect(path).toContain("text-decoration-line: line-through");
    expect(path).toContain("text-decoration-color: currentColor");
  });

  it("maps change statuses to the three semantic theme colors", () => {
    const added = declarations('.git-change-status[data-tone="added"],\n.git-change-status[data-tone="untracked"]');
    expect(added).toContain("--git-change-status-color: var(--accent)");

    const changed = declarations('.git-change-status[data-tone="modified"],\n.git-change-status[data-tone="renamed"],\n.git-change-status[data-tone="copied"],\n.git-change-status[data-tone="default"]');
    expect(changed).toContain("--git-change-status-color: var(--warning)");

    const destructive = declarations('.git-change-status[data-tone="deleted"],\n.git-change-status[data-tone="conflict"]');
    expect(destructive).toContain("--git-change-status-color: var(--danger)");
  });

  it("preserves semantic status colors when a row is selected", () => {
    expect(declarations(".git-change-status", shellStyles)).toContain("color: var(--git-change-status-color, var(--accent))");
    expect(declarations('.git-change-row.previewable[data-selected="true"] .git-change-status', shellStyles)).toContain("color: var(--git-change-status-color, var(--file-selection-secondary-foreground))");
  });
});
