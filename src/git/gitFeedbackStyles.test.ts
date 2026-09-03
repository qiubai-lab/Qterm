// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/git/styles/gitShell.css", "utf8");

describe("Git feedback styles", () => {
  it("keeps critical error text readable and vertically centered", () => {
    const feedback = css.match(/\.git-feedback \{([^}]+)\}/u)?.[1];
    expect(feedback).toContain("display: flex");
    expect(feedback).toContain("align-items: center");
    expect(feedback).toContain("flex: 0 0 26px");
    expect(feedback).toContain("font-size: 10px");
  });
});
