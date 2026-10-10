import { expect, it } from "vitest";
import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

it("uses semantic theme roles for progress states and keeps the compact header height", () => {
  expect(styles).toContain("--terminal-progress-tone:var(--accent)");
  expect(styles).toMatch(/\.terminal-task-progress\[data-state="error"\]\s*\{[^}]*var\(--danger\)/);
  expect(styles).toMatch(/\.terminal-task-progress\[data-state="paused"\]\s*\{[^}]*var\(--warning\)/);
  expect(styles).toMatch(/\.terminal-task-progress\s*\{[^}]*height:16px/);
  expect(styles).toMatch(/\.terminal-activity-metadata\s*\{[^}]*overflow:clip/);
  expect(styles).toContain("border-radius:var(--terminal-activity-radius)");
  expect(styles.match(/--terminal-activity-radius\s*:[^;]+;/g)).toEqual(["--terminal-activity-radius:3px;"]);
});

it("retains progress in narrow panes and respects reduced motion", () => {
  expect(styles).toMatch(/max-width:390px\)\s*\{\s*\.terminal-progress-label\s*\{\s*display:none/);
  expect(styles).toMatch(/max-width:480px\)[\s\S]*?data-has-progress="true"[^}]*display:none/);
  expect(styles).toContain("grid-template-columns:minmax(0,1fr) auto");
  expect(styles).toMatch(/prefers-reduced-motion:reduce\)\s*\{\s*\.terminal-progress-ring\s*\{\s*animation:none!important/);
  expect(styles).toMatch(/\.terminal-application-title-text\s*\{[^}]*text-overflow:ellipsis/);
  expect(styles).toContain("animation:terminal-progress-enter 140ms");
  expect(styles).toContain("animation:terminal-progress-exit 120ms");
  expect(styles).toContain("@keyframes terminal-progress-exit { from { opacity:1; } to { opacity:0; } }");
});
