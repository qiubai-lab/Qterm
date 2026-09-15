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
  expect(css).toMatch(/\.terminal-image-size-control \{[^}]*margin-right:24px/);
  expect(css).toMatch(/\.terminal-image-size-shell \{[^}]*width:252px[^}]*height:26px[^}]*gap:4px[^}]*padding:0 6px 0 18px[^}]*border:1px solid var\(--border\)/);
  expect(css).toMatch(/\.terminal-image-pixel-size \{[^}]*width:100px[^}]*text-align:center/);
  expect(css).toMatch(/\.terminal-image-sizes>button \{[^}]*align-items:center[^}]*justify-content:center[^}]*text-align:center/);
  expect(css).toMatch(/\.terminal-image-size-label \{[^}]*place-items:center/);
  expect(css).toMatch(/\.terminal-image-sizes>button:hover[^}]*background:var\(--hover\)/);
  expect(css).toMatch(/\.terminal-image-sizes>button\[aria-pressed="true"\] \{[^}]*color:var\(--selection-marker\)/);
  expect(css).not.toContain(".terminal-image-sizes::before");
  const themes = readCssBundle("src/app/app.css");
  expect(themes).toContain("--selection-marker:#fcee0a");
  for (const theme of ["light", "cyberpunk"]) expect(themes).toContain(`[data-terminal-image-theme="${theme}"],\n:root[data-theme="${theme}"]`);
  expect(themes).toContain("[data-terminal-image-theme],\n:root");
});
