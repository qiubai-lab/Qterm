// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const css = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
it("gives status and name equal text metrics with room for Windows CJK glyphs", () => {
  const chrome = css("./runtimeChrome.css");
  expect(chrome).toMatch(/\.runtime-status-tag\s*\{[^}]*align-items:center[^}]*height:20px[^}]*font-size:10px; line-height:14px/);
  expect(chrome).toMatch(/\.runtime-status-tag small\s*\{[^}]*flex:none; font:inherit; white-space:nowrap/);
  expect(chrome).toMatch(/\.runtime-tag-name\s*\{[^}]*min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap/);
});
it("keeps chrome seamless and stops breathing for reduced motion", () => {
  const chrome = css("./runtimeChrome.css");
  expect(chrome).toMatch(/\.runtime-desktop-controls\s*\{[^}]*background:transparent/);
  expect(chrome).toMatch(/\.runtime-trigger\s*\{[^}]*border:0/);
  expect(chrome).toContain('[data-status="已连接"]::before');
  expect(chrome).toMatch(/@media \(prefers-reduced-motion:reduce\)[\s\S]*animation:none/);
  expect(chrome).toContain("animation-play-state:paused");
  expect(chrome).toContain('@media (prefers-reduced-motion:reduce) { .runtime-status-tag[data-status]::before');
});
it("uses shared theme roles for remote surfaces without fixed palette colors", () => {
  for (const file of ["runtimeChrome.css", "runtimeMenu.css", "runtimeManager.css"]) {
    expect(css(`./${file}`)).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
  }
  expect(css("./runtimeManager.css")).toContain("var(--selection-surface)");
  expect(css("./runtimeMenu.css")).toContain("var(--menu-hover-background)");
});
it("keeps business portals hidden while allowing only the environment control menu during authentication", () => {
  expect(css("../server/server.css")).toContain('html[data-web-data-paused] body > :not(#root):not([data-runtime-control-plane="environment-menu"]) { visibility: hidden !important; pointer-events: none !important; }');
});
it("keeps switch progress visible in the reserved status slot and respects reduced motion", () => {
  const styles = css("./remoteRuntime.css");
  expect(styles).toMatch(/\.dialog-action-status\.runtime-switch-status\s*\{[^}]*color:var\(--muted\)/);
  expect(styles).toMatch(/@media \(prefers-reduced-motion:reduce\)[\s\S]*\.runtime-switch-spinner[^}]*animation:none/);
});
