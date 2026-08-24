import { describe, expect, it } from "vitest";

import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`(?:^|}|,)\\s*${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  return matches[matches.length - 1]?.[1] ?? "";
}

describe("terminal search surface styles", () => {
  it("keeps the native search input optically centered without global form chrome", () => {
    const input = declarations(".terminal-search input");
    const focus = declarations(".terminal-search input:focus-visible");

    expect(input).toContain("height:24px");
    expect(input).toContain("margin:0");
    expect(input).toContain("line-height:24px");
    expect(input).toContain("box-shadow:none");
    expect(input).toContain("appearance:none");
    expect(focus).toContain("box-shadow:none");
  });

  it("animates both mounting directions and removes spatial motion when requested", () => {
    expect(styles).toContain('.terminal-search[data-state="open"]');
    expect(styles).toContain('animation:terminal-search-in 140ms');
    expect(styles).toContain('.terminal-search[data-state="closing"]');
    expect(styles).toContain('animation:terminal-search-out 110ms');
    expect(styles).toContain('@keyframes terminal-search-out');
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*terminal-search-fade-in/);
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*terminal-search-fade-out/);
  });
});
