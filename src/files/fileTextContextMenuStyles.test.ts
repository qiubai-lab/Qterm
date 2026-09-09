import { describe, expect, it } from "vitest";

import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

describe("file text context-menu styles", () => {
  it("uses the shared themed menu layout and keeps disabled actions visually inactive", () => {
    expect(styles).toMatch(/\.file-text-context-menu\{[^}]*width:190px/);
    expect(styles).toMatch(/\.file-text-context-menu button\{[^}]*display:flex[^}]*justify-content:space-between/);
    expect(styles).toMatch(/\.file-text-context-menu button:disabled[^}]*color:var\(--text-disabled\)[^}]*background:transparent/);
    expect(styles).toMatch(/\.file-markdown-preview:focus-visible\{[^}]*outline:2px solid var\(--focus\)/);
  });
});
