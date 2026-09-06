// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/git/styles/gitFeedback.css", "utf8");

describe("Git feedback styles", () => {
  it("presents Git failures as a structured persistent alert", () => {
    const feedback = css.match(/\.git-feedback \{([^}]+)\}/u)?.[1];
    expect(feedback).toContain("display: grid");
    expect(feedback).toContain("align-items: center");
    expect(feedback).toContain("border: 2px solid color-mix(in srgb, var(--danger)");
    expect(feedback).toContain("background: color-mix(in srgb, var(--danger-bg)");
    expect(feedback).not.toContain("inset 2px 0");
    expect(css.match(/\.git-repository-card \.git-feedback \{([^}]+)\}/u)?.[1]).toContain("margin: 0 3px 3px");
    expect(css).toContain(".git-feedback-copy strong");
    expect(css).toContain(".git-feedback-icon");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".git-feedback[data-tone=\"warning\"]");
  });
});
