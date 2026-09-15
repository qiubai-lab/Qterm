// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readCssBundle } from "../../test/css";

it("keeps controls fixed around an independently scrolling preview and isolates theme sampling", () => {
  const css = readFileSync("src/terminal/imageExport/terminalImageExport.css", "utf8");
  expect(css).toMatch(/\.terminal-image-dialog \.dialog-content[^}]*min-height:0[^}]*overflow:hidden/);
  expect(css).toMatch(/\.terminal-image-workbench[^}]*minmax\(0,1fr\)/);
  expect(css).toMatch(/\.terminal-image-footer[^}]*flex:none/);
  expect(css).toMatch(/\.terminal-image-preview \{[^}]*overflow:auto/);
  expect(css).toContain("prefers-reduced-motion:reduce");
  expect(css).toContain('.terminal-image-styles>button[aria-pressed="true"],.terminal-image-themes>button[aria-pressed="true"]');
  expect(css).not.toContain("inset 0 -2px");
  expect(css).toMatch(/\.terminal-image-action \{[^}]*position:relative/);
  expect(css).toMatch(/\.terminal-image-feedback-bubble \{[^}]*position:absolute[^}]*bottom:calc\(100% \+ 10px\)/);
  expect(css).toContain('.terminal-image-feedback-bubble[data-tone="error"] { --feedback-accent:var(--danger); }');
  const themes = readCssBundle("src/app/app.css");
  for (const theme of ["light", "cyberpunk"]) expect(themes).toContain(`[data-terminal-image-theme="${theme}"],\n:root[data-theme="${theme}"]`);
  expect(themes).toContain("[data-terminal-image-theme],\n:root");
});
