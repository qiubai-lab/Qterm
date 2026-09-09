import { describe, expect, it } from "vitest";

import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`(?:^|}|,)\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("file list horizontal overflow styles", () => {
  it("extends headers and row selection surfaces across the scrollable column width", () => {
    expect(declarations(".file-browser-content")).toContain("--file-list-min-width:414px");
    expect(declarations(".file-browser-columns,.file-list")).toContain("width:100%;min-width:var(--file-list-min-width)");
    expect(styles).toContain("@container (max-width:440px){.file-browser-content{--file-list-min-width:366px}");
    expect(styles).toContain("@container (max-width:366px){.file-browser-content{--file-list-min-width:234px}");
    expect(styles).toContain(".file-modified-column{display:none}");
    expect(styles).toContain("@container (max-width:234px){.file-browser-content{--file-list-min-width:0px}");
    expect(styles).toContain(".file-size-column{display:none}");
    expect(styles).toContain(".file-list>.file-row{width:100%");
    expect(styles).toContain(".file-list-virtual>.file-row{position:absolute;top:0;left:3px;width:calc(100% - 6px)");
    expect(declarations(".file-name>span")).toContain("text-overflow:ellipsis");
  });
});
