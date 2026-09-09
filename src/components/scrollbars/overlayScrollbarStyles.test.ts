import { describe, expect, it } from "vitest";
import { readCssBundle } from "../../test/css";

const css = readCssBundle("src/components/scrollbars/overlayScrollbar.css");

describe("overlay scrollbar styles", () => {
  it("overlays hidden native chrome without consuming viewport width", () => {
    expect(css).toMatch(/\.overlay-scroll-area\s*\{[^}]*position:\s*relative[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.overlay-scroll-viewport::-webkit-scrollbar\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(/\.overlay-scrollbars\s*\{[^}]*position:\s*absolute[^}]*pointer-events:\s*none/s);
  });

  it("uses a terminal-like thin thumb that grows only during interaction", () => {
    expect(css).toMatch(/\.overlay-scroll-area\s*\{[^}]*--overlay-scrollbar-thickness:\s*3px/s);
    expect(css).toMatch(/data-density="compact"[^}]*--overlay-scrollbar-thickness:\s*2px/s);
    expect(css).toMatch(/data-dragging="y"[^}]*scaleX\(var\(--overlay-scrollbar-active-scale\)\)/s);
  });

  it("removes motion for reduced-motion users", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none/);
  });
});
