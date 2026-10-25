import { expect, it } from "vitest";
import { readCssBundle } from "../test/css";

it("animates an opaque menu by translation and keeps its themed stroke inside the native cutout", () => {
  const css = readCssBundle("src/web/webTabMenu.css");
  expect(css).toContain("border: 1px solid var(--raised)");
  expect(css).toContain("--web-tab-menu-stroke: var(--floating-border)");
  expect(css).toContain("box-shadow: inset 0 0 0 1px var(--web-tab-menu-stroke)");
  expect(css).toContain("animation: web-tab-menu-in 150ms");
  expect(css).toContain("transform: translateY(-4px)");
  expect(css).toContain("transform: translateY(0)");
  expect(css).not.toMatch(/opacity:|scale\(/);
  expect(css).toMatch(/prefers-reduced-motion: reduce[^}]*animation: none/s);
  expect(css).toMatch(/prefers-contrast: more[^}]*var\(--border\)/s);
});
