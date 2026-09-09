import { describe, expect, it } from "vitest";

import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

describe("file search styles", () => {
  it("keeps the search overlay compact, themed, and keyboard visible", () => {
    expect(styles).toMatch(/\.file-search\{[^}]*position:absolute[^}]*width:min\(360px,calc\(100% - 16px\)\)[^}]*background:var\(--raised\)/);
    expect(styles).toMatch(/\.file-search:focus-within\{[^}]*border-color:color-mix\(in srgb,var\(--focus\)/);
    expect(styles).toMatch(/\.file-search button:focus-visible\{[^}]*var\(--focus\)/);
  });

  it("distinguishes ordinary and active matches with theme tokens", () => {
    expect(styles).toMatch(/\.file-search-match,.cm-file-search-match\{[^}]*var\(--warning\)/);
    expect(styles).toMatch(/\.file-search-match-active,.cm-file-search-match-active\{[^}]*var\(--file-selection-marker\)/);
  });
});
