// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("src/components/dialogs/credentialDialog.css", "utf8").replace(/\s+/g, "");

describe("credential manager selection motion", () => {
  it("uses one transform-only primary selection surface", () => {
    expect(styles).toMatch(/\.credential-item:hover\{border-color:transparent;background:var\(--hover\)/);
    expect(styles).not.toMatch(/\.credential-item:hover\{[^}]*navigation-accent/);
    expect(styles).toMatch(/\.credential-selection-indicator\.ready\{[^}]*transition:transform280mscubic-bezier\(\.22,1,\.36,1\),opacity120msease/);
    expect(styles).not.toMatch(/\.credential-selection-indicator\.ready\{[^}]*transition:[^}]*(?:top|height|width)/);
    expect(styles).toMatch(/\.credential-item\.selected\{[^}]*background:transparent[^}]*box-shadow:none/);
    expect(styles).toMatch(/\.credential-item\.selected:hover\{[^}]*background:transparent/);
    expect(styles).toMatch(/\.credential-item\.selected\.credential-kind-icon\{[^}]*color:var\(--selection-marker\)[^}]*background:var\(--selection-surface\)/);
    expect(styles).toMatch(/\.credential-item\.selected\.credential-item-copystrong\{color:var\(--selection-marker\)/);
  });

  it("uses ordered detail entry, a distinct creation entry, and reduced motion", () => {
    expect(styles).toMatch(/\.credential-editor-stage\.switching-down\{animation:credential-stage-enter-from-below200mscubic-bezier\(\.33,1,\.68,1\)/);
    expect(styles).toMatch(/\.credential-editor-stage\.switching-up\{animation:credential-stage-enter-from-above200mscubic-bezier\(\.33,1,\.68,1\)/);
    expect(styles).toMatch(/\.credential-editor-stage\.creating\{animation:credential-stage-create240mscubic-bezier\(\.33,1,\.68,1\)/);
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.credential-selection-indicator\.ready\{transition:none!important\}[\s\S]*credential-stage-fade100msease-out!important/);
  });
});
