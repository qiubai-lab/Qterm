import { expect, it } from "vitest";
import { readCssBundle } from "../test/css";

it("keeps connection popovers opaque with native-mirrored borders and translation-only motion", () => {
  const css = readCssBundle("src/web/webBlock.css");
  for (const kind of ["host-summary", "connection-picker", "connection-group"]) expect(css).toContain(`[data-web-native-overlay="${kind}"]`);
  expect(css).toContain("body:has(.web-browser-surface)");
  expect(css).toContain("--web-native-overlay-stroke: var(--floating-border)");
  expect(css).toContain("box-shadow: inset 0 0 0 1px var(--web-native-overlay-stroke)");
  expect(css).toContain("animation: web-connection-popover-in 150ms");
  expect(css).toMatch(/prefers-reduced-motion: reduce[^}]*animation: none/s);
  expect(css).toMatch(/prefers-contrast: more[^}]*var\(--border\)/s);
});
