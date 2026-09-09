import { describe, expect, it } from "vitest";

import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

describe("Markdown table layout", () => {
  it("keeps overflow on the table and lets long cell content wrap", () => {
    expect(styles).toMatch(/\.file-markdown-table\{[^}]*width:100%[^}]*max-width:100%[^}]*overflow-x:auto/);
    expect(styles).toMatch(/\.file-markdown-table>table\{[^}]*width:100%[^}]*border-collapse:collapse/);
    expect(styles).toMatch(/\.file-markdown-preview th,.file-markdown-preview td\{[^}]*overflow-wrap:anywhere/);
    expect(styles).toMatch(/\.file-markdown-preview td a,.file-markdown-preview td>code\{[^}]*white-space:normal/);
    expect(styles).toMatch(/\.file-markdown-preview pre\{[^}]*overflow:auto/);
  });

  it("wraps long prose and inline code without changing code-block scrolling", () => {
    expect(styles).toMatch(/\.file-markdown-preview\{[^}]*overflow-x:hidden[^}]*overflow-wrap:anywhere/);
    expect(styles).toMatch(/\.file-markdown-preview>\*\{[^}]*max-width:100%/);
    expect(styles).toMatch(/\.file-markdown-preview :not\(pre\)>code\{[^}]*overflow-wrap:anywhere[^}]*white-space:break-spaces/);
    expect(styles).toMatch(/\.file-markdown-preview pre\{[^}]*max-width:100%[^}]*overflow:auto/);
  });
});
