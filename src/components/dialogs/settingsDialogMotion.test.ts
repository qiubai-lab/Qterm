// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("src/components/dialogs/settingsDialog.css", "utf8");
const lightOverrides = readFileSync("src/app/styles/themes/lightOverrides.css", "utf8");

describe("settings category navigation motion", () => {
  it("constrains advanced scrolling to the options below the fixed heading", () => {
    expect(styles).toContain(".settings-content-scroll.settings-content-fixed{display:flex;overflow:hidden}");
    expect(styles).toContain(".settings-content-fixed>.settings-category-panel{display:flex;min-height:0;flex:1}");
    expect(styles).toContain(".settings-advanced-view{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column}");
    expect(styles).toContain(".settings-advanced-view>.settings-section-heading{flex:none}");
    expect(styles).toContain(".settings-advanced-scroll{flex:1}");
    expect(styles).toContain(".settings-advanced-options{overflow:auto;overscroll-behavior:contain}");
  });
  it("moves one selection indicator between fixed category rows", () => {
    expect(styles).toMatch(/\.settings-nav-indicator\{[^}]*transition:transform 250ms cubic-bezier\(\.2,\.8,\.2,1\)/);
    expect(styles).toContain('.settings-nav-list[data-active="appearance"] .settings-nav-indicator{transform:translateY(47px)}');
    expect(styles).toContain('.settings-nav-list[data-active="security"] .settings-nav-indicator{transform:translateY(94px)}');
    expect(styles).toContain('.settings-nav-list[data-active="advanced"] .settings-nav-indicator{transform:translateY(141px)}');
  });

  it("keeps selected buttons transparent and removes sliding under reduced motion", () => {
    expect(styles).toMatch(/\.settings-nav-item\.selected\{[^}]*background:transparent/);
    expect(lightOverrides).toMatch(/\.settings-nav-item\.selected[^}]*background:transparent/);
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.settings-nav-indicator\{transition:none!important\}/);
  });

  it("slides category content in the same navigation direction with a reduced-motion fade", () => {
    expect(styles).toContain(".settings-category-panel.settings-category-forward{animation:settings-category-forward 230ms cubic-bezier(.2,.8,.2,1)}");
    expect(styles).toContain(".settings-category-panel.settings-category-backward{animation:settings-category-backward 230ms cubic-bezier(.2,.8,.2,1)}");
    expect(styles).toContain("@keyframes settings-category-forward{from{opacity:.35;transform:translateX(8px)}to{opacity:1;transform:none}}");
    expect(styles).toContain("@keyframes settings-category-backward{from{opacity:.35;transform:translateX(-8px)}to{opacity:1;transform:none}}");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.settings-category-panel\.settings-category-forward,[^}]*animation:settings-category-fade 100ms ease-out!important/);
  });
});
