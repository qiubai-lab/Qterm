// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("src/components/dialogs/connectionDialog.css", "utf8").replace(/\s+/g, "");
const cyberpunk = readFileSync("src/app/styles/themes/cyberpunk.css", "utf8");

describe("connection manager selection motion", () => {
  it("colors groups with the active theme accent, including cyber cyan", () => {
    expect(styles).toMatch(/\.connection-group-heading\{[^}]*color:var\(--accent\)[^}]*background:color-mix\(insrgb,var\(--accent-bg\)/);
    expect(styles).toMatch(/\.connection-group-heading:hover\{[^}]*border-color:color-mix\(insrgb,var\(--accent\)/);
    expect(cyberpunk).toMatch(/--accent:#00ddeb/);
  });

  it("moves one primary selection surface without animating layout", () => {
    expect(styles).toMatch(/\.connection-selection-indicator\.ready\{[^}]*transition:transform280mscubic-bezier\(\.22,1,\.36,1\),opacity120msease/);
    expect(styles).not.toMatch(/\.connection-selection-indicator\.ready\{[^}]*transition:[^}]*(?:top|height|width)/);
    expect(styles).toMatch(/\.connection-item\.selected:not\(\[data-primary-selected\]\)\{[^}]*background:var\(--selection-surface\)/);
  });

  it("distinguishes profile switching from creation and honors reduced motion", () => {
    expect(styles).toContain(".connection-editor-profile-stage.switching-down{animation:connection-profile-enter-from-below200mscubic-bezier(.33,1,.68,1)}");
    expect(styles).toContain(".connection-editor-profile-stage.switching-up{animation:connection-profile-enter-from-above200mscubic-bezier(.33,1,.68,1)}");
    expect(styles).toContain(".connection-editor-profile-stage.creating{animation:connection-profile-create240mscubic-bezier(.33,1,.68,1)}");
    expect(styles).not.toContain("connection-editor-profile-snapshot");
    expect(styles).not.toContain("view-transition-name");
    expect(styles).not.toContain("::view-transition-");
    expect(styles).toContain("@keyframesconnection-profile-enter-from-below{from{opacity:.35;transform:translateY(7px)}to{opacity:1;transform:none}}");
    expect(styles).toContain("@keyframesconnection-profile-create{from{opacity:.25;transform:translateY(6px)scale(.985)}to{opacity:1;transform:none}}");
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.connection-selection-indicator\.ready\{transition:none!important\}[\s\S]*\.connection-editor-profile-stage\.switching-down,\.connection-editor-profile-stage\.switching-up,[^}]*animation:connection-profile-fade100msease-out!important/);
  });
});
