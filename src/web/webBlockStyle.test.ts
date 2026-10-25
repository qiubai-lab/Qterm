import { readCssBundle } from "../test/css";
import { expect, it } from "vitest";

it("uses terminal chrome without feature header overrides and keeps address controls compact", () => {
  const css = readCssBundle("src/web/webBlock.css");
  expect(css).not.toMatch(/\.web-block-header|\.web-block-title|\.web-block-status|\.terminal-block-header/);
  expect(css).toMatch(/\.web-address-bar\s*\{[^}]*height: 34px/);
  expect(css).toMatch(/\.web-address-field > input\s*\{[^}]*min-width: 0[^}]*flex: 1/);
  expect(css).toMatch(/\.web-address-bar > button, \.web-data-control > button\s*\{[^}]*width: 25px[^}]*height: 25px[^}]*background: transparent/);
  // Toolbar sizing must not leak into the cleanup popover's text actions.
  expect(css).not.toMatch(/\.web-address-bar button\s*\{/);
  expect(css).toContain(":focus-visible");
  expect(css).toContain("var(--focus)");
  expect(css).toMatch(/\.web-address-field\s*\{[^}]*border: 1px solid transparent/);
  expect(css).toMatch(/\.web-address-field:has\(> input:hover, > \.web-data-control > button:hover\)\s*\{[^}]*border-color: var\(--subtle\)/);
  expect(css).toMatch(/\.web-address-field:has\(> input:focus, > \.web-data-control > button:focus-visible\)\s*\{[^}]*border-color: var\(--focus\)/);
  expect(css).not.toMatch(/\.web-address-field:(?:hover|focus-within)\s*\{/);
  expect(css).not.toContain(".web-address-loading");
  expect(css).toContain("prefers-reduced-motion: reduce");
  expect(css).toContain("animation: none");
  expect(css).toMatch(/\.web-browser-surface\s*\{[^}]*overflow: clip/);
});

it("keeps the editor borderless across hover and focus without styling cleanup checkboxes", () => {
  const css = readCssBundle("src/web/webBlock.css");
  const popover = readCssBundle("src/web/webDataPopover.css");
  expect(css).toMatch(/\.web-address-field > input\s*\{[^}]*padding: 0 5px[^}]*border: 0/);
  expect(css).toMatch(/\.web-address-field > input:is\(:hover, :focus, :focus-visible\)\s*\{[^}]*border: 0[^}]*outline: none/);
  expect(css).not.toMatch(/\.web-address-(?:bar|field) input/);
  expect(popover).not.toMatch(/\.web-address-field input/);
  // Highlight states may change paint, never the editor's text offset or available width.
  for (const match of css.matchAll(/(\.web-address-field[^{}]*(?::hover|:focus)[^{}]*)\{([^}]*)\}/g)) {
    expect(match[2]).not.toMatch(/(?:padding|margin|width|height|transform)\s*:/);
  }
  expect(popover).toMatch(/\.web-address-field \.web-data-control > button:is\(:hover, :focus-visible, \[aria-expanded="true"\]\):not\(:disabled\)[^{]*\{[^}]*var\(--accent\)[^}]*var\(--accent-bg\)/);
});
