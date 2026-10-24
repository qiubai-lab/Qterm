import { readCssBundle } from "../test/css";
import { expect, it } from "vitest";

it("uses terminal chrome without feature header overrides and keeps address controls compact", () => {
  const css = readCssBundle("src/web/webBlock.css");
  expect(css).not.toMatch(/\.web-block-header|\.web-block-title|\.web-block-status|\.terminal-block-header/);
  expect(css).toMatch(/\.web-address-bar\s*\{[^}]*height: 34px/);
  expect(css).toMatch(/\.web-address-bar input\s*\{[^}]*min-width: 0[^}]*flex: 1/);
  expect(css).toMatch(/\.web-address-bar button\s*\{[^}]*width: 25px[^}]*height: 25px[^}]*background: transparent/);
  expect(css).toContain(":focus-visible");
  expect(css).toContain("var(--focus)");
  expect(css).toMatch(/\.web-address-bar input:hover\s*\{[^}]*border-color: var\(--subtle\)[^}]*box-shadow: none/);
  expect(css).toMatch(/\.web-address-bar input:focus\s*\{[^}]*box-shadow: none/);
  expect(css).toMatch(/\.web-address-bar input:focus-visible\s*\{[^}]*outline: 1px solid var\(--focus\)/);
  expect(css).toMatch(/\.web-address-loading\s*\{[^}]*width: 16px[^}]*flex: none/);
  expect(css).toContain("prefers-reduced-motion: reduce");
  expect(css).toContain("animation: none");
  expect(css).toMatch(/\.web-browser-surface\s*\{[^}]*overflow: clip/);
});
