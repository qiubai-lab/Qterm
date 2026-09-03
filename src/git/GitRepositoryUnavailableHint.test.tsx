import { describe, expect, it } from "vitest";

// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";

const styles = readFileSync("src/git/styles/gitRepositoryTree.css", "utf8").replace(/\s+/g, " ");

describe("GitRepositoryUnavailableHint styles", () => {
  it("uses a portaled, theme-danger, motion-safe bubble", () => {
    expect(styles).toMatch(/\.git-repository-unavailable-hint \{[^}]+position: fixed;[^}]+z-index: 130;/);
    expect(styles).toMatch(/\.git-repository-unavailable-hint \{[^}]+max-width: min\(300px, calc\(100vw - 16px\)\);/);
    expect(styles).toMatch(/\.git-repository-unavailable-hint \{[^}]+border:[^}]+var\(--danger\)[^}]+color: var\(--danger\);[^}]+background:[^}]+var\(--danger-bg\)/);
    expect(styles).toContain('.git-repository-unavailable-hint[data-placement="above"] { transform: translateY(-100%); }');
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]+\.git-repository-unavailable-hint \{ animation: none;/);
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
