import { describe, expect, it } from "vitest";

import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

describe("terminal external-link confirmation styles", () => {
  it("keeps the full target readable in a compact theme-aware warning surface", () => {
    expect(styles).toMatch(/\.terminal-external-link-target\{[^}]*min-width:0[^}]*margin-top:9px[^}]*var\(--warning\)[^}]*var\(--panel-bg\)/);
    expect(styles).toMatch(/\.terminal-external-link-target>code\{[^}]*max-height:68px[^}]*overflow:auto[^}]*var\(--text\)[^}]*overflow-wrap:anywhere[^}]*user-select:text/);
  });
});

it("uses two equal columns filling the footer with a separate reserved feedback slot", () => {
  expect(styles).toMatch(/\.terminal-link-choices\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*width:\s*100%/);
  expect(styles).toMatch(/\.terminal-link-actions \.dialog-action-status\s*\{[^}]*height:\s*15px/);
});
