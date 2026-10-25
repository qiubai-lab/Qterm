import { expect, it } from "vitest";
import { readCssBundle } from "../test/css";

it("animates an opaque menu by translation and keeps its themed stroke inside the native cutout", () => {
  const css = readCssBundle("src/components/overlays/nativeOverlay.css");
  expect(css).toContain("border: 1px solid var(--raised)");
  expect(css).toContain("--app-overlay-stroke: var(--floating-border)");
  expect(css).toContain("box-shadow: inset 0 0 0 1px var(--app-overlay-stroke)");
  expect(css).toContain("animation: app-overlay-in 130ms");
  expect(css).toContain("translate: 0 -3px");
  expect(css).toContain("translate: 0 0");
  expect(css).not.toMatch(/opacity:\s*0|scale\(/);
  expect(css).toMatch(/prefers-reduced-motion: reduce[^}]*animation: none/s);
  expect(css).toMatch(/prefers-contrast: more[^}]*var\(--border\)/s);
});

it("gives all hover bubbles the connection-status entrance without a scale exit", () => {
  const css = readCssBundle("src/app/app.css");
  expect(css).toContain('[data-app-overlay="floating"][data-overlay-motion="hover"]');
  const motion = readCssBundle("src/components/hoverTooltip.css");
  expect(motion).toContain("animation: hover-tooltip-in 130ms cubic-bezier(.16, 1, .3, 1)");
  expect(motion).toContain("from { translate: 0 -3px; }");
  expect(motion).toMatch(/prefers-reduced-motion: reduce[^}]*animation: none/s);
  expect(motion).not.toMatch(/opacity:\s*0|scale\(/);
  expect(readCssBundle("src/components/themedTooltip.css")).not.toMatch(/transition:|transform:|scale\(/);
});
