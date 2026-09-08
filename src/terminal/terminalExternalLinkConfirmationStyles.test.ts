import { describe, expect, it } from "vitest";

import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

describe("terminal external-link confirmation styles", () => {
  it("keeps the full target readable in a compact theme-aware warning surface", () => {
    expect(styles).toMatch(/\.terminal-external-link-target\{[^}]*min-width:0[^}]*margin-top:9px[^}]*var\(--warning\)[^}]*var\(--panel-bg\)/);
    expect(styles).toMatch(/\.terminal-external-link-target>code\{[^}]*max-height:68px[^}]*overflow:auto[^}]*var\(--text\)[^}]*overflow-wrap:anywhere[^}]*user-select:text/);
  });
});
