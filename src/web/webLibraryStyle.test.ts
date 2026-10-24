import { expect, it } from "vitest";
import { readCssBundle } from "../test/css";

it("uses a wider dialog and compact theme-aware tabs", () => {
  const css = readCssBundle("src/web/webLibrary.css");
  expect(css).toMatch(/\.dialog-frame\.web-library-dialog\s*\{[^}]*width: min\(660px/);
  expect(css).toMatch(/\.web-library-tabs button\s*\{[^}]*width: 78px/);
  expect(css).toContain("color: var(--navigation-accent)");
  expect(css).toContain("background: var(--navigation-accent-bg)");
  expect(css).toContain("translateX(78px)");
});

it("caps recent history at five fixed-height rows as further batches load", () => {
  const css = readCssBundle("src/web/webAddressHistory.css");
  expect(css).toMatch(/\.web-address-history-list\s*\{[^}]*max-height: 196px[^}]*overscroll-behavior: contain/);
  expect(css).toMatch(/\.web-address-history-entry\s*\{[^}]*height: 38px/);
});

it("keeps the history scroller inside a growing content area with fixed toolbar and footer", () => {
  const css = readCssBundle("src/web/webLibrary.css");
  expect(css).toMatch(/\.web-library-dialog \.dialog-content\s*\{[^}]*flex: 1[^}]*min-height: 0[^}]*overflow: hidden/);
  expect(css).toMatch(/\.web-library-scroll\s*\{[^}]*flex: 1[^}]*min-height: 0/);
  expect(css).toMatch(/\.web-library-list\s*\{[^}]*min-height: 0[^}]*overflow: auto/);
  expect(css).toMatch(/\.web-library-footer\s*\{[^}]*flex: none[^}]*height: 40px/);
  expect(css).toMatch(/\.web-library-footer \.ui-button\s*\{[^}]*min-height: 24px[^}]*height: 24px/);
  expect(css).toContain("prefers-reduced-motion: reduce");
});

it("lets a constrained address dropdown scroll its options while keeping more history fixed", () => {
  const css = readCssBundle("src/web/webAddressHistory.css");
  expect(css).toMatch(/\.web-address-history-scroll\s*\{[^}]*display: flex[^}]*flex-direction: column[^}]*min-height: 0/);
  expect(css).toMatch(/\.web-address-history-list\s*\{[^}]*flex: 1 1 auto[^}]*overflow: auto/);
  expect(css).toMatch(/\.web-address-history-more\s*\{[^}]*flex: none[^}]*min-height: 28px/);
});

it("reveals opaque history content without scaling text and respects reduced motion", () => {
  const css = readCssBundle("src/web/webAddressHistory.css");
  expect(css).toContain("transition: clip-path 160ms");
  expect(css).toContain("transition-duration: 120ms");
  expect(css).toContain("@starting-style");
  expect(css).toMatch(/prefers-reduced-motion: reduce[^}]*transition: none/);
  expect(css).not.toMatch(/opacity:|scaleY|box-shadow: 0/);
});

it("keeps the more-history hover outline inset from the rounded panel edge", () => {
  const css = readCssBundle("src/web/webAddressHistory.css");
  expect(css).toMatch(/\.web-address-history-more\s*\{[^}]*width: calc\(100% - 6px\)[^}]*margin: 3px/);
  expect(css).toMatch(/\.web-address-history-more:hover\s*\{[^}]*box-shadow: inset/);
});
