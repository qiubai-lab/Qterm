import { expect, it } from "vitest";
import { readCssBundle } from "../test/css";

it("keeps connection popovers opaque with native-mirrored borders and translation-only motion", () => {
  const css = readCssBundle("src/web/webBlock.css");
  expect(css).toContain('[data-app-overlay="floating"]');
  expect(css).toContain("body:has(.web-browser-surface)");
  expect(css).toContain("--app-overlay-stroke: var(--floating-border)");
  expect(css).toContain("box-shadow: inset 0 0 0 1px var(--app-overlay-stroke)");
  expect(css).toContain("animation: app-overlay-in 130ms");
  expect(css).toMatch(/prefers-reduced-motion: reduce[^}]*animation: none/s);
  expect(css).toMatch(/prefers-contrast: more[^}]*var\(--border\)/s);
});

it("gives the cleanup card grouped content and an opaque rounded rim without fading native content", () => {
  const css = readCssBundle("src/web/webDataPopover.css");
  expect(css).toMatch(/\.web-data-popover\s*\{[^}]*border-radius: 9px[^}]*background: var\(--raised\)[^}]*box-shadow: inset/);
  expect(css).toContain("--app-overlay-stroke: var(--floating-border)");
  expect(css).toMatch(/\.web-data-options\s*\{[^}]*border-radius: 7px[^}]*background: var\(--panel-bg\)/);
  expect(css).toMatch(/\.web-data-status\s*\{[^}]*height: 28px[^}]*overflow: auto/);
  expect(css).toMatch(/@keyframes web-data-popover-in[^]*translateY\(-4px\)[^]*translateY\(0\)/);
  expect(css).toMatch(/prefers-reduced-motion: reduce[^}]*animation: none/);
  expect(css).not.toMatch(/backdrop-filter|scale\(/);
});

it("resets global form-label spacing for compact options and reserves row outlines for keyboard focus", () => {
  const css = readCssBundle("src/web/webDataPopover.css");
  expect(css).toMatch(/\.web-data-options label\s*\{[^}]*margin: 0[^}]*padding: 6px 8px[^}]*letter-spacing: normal[^}]*text-transform: none/);
  expect(css).toMatch(/\.web-data-options small\s*\{[^}]*margin-top: 1px[^}]*font-weight: 400[^}]*line-height: 12px/);
  expect(css).toContain(".web-data-options label:has(input:focus-visible)");
  expect(css).not.toContain(".web-data-options label:focus-within");
});
