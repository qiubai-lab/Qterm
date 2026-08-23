// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCssBundle } from "../../test/css";

const styles = readFileSync("src/components/dialogs/aboutUpdate.css", "utf8");
const globalStyles = readCssBundle("src/app/app.css");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("about update styles", () => {
  it("keeps the about-page launcher compact and the update result geometry stable", () => {
    expect(globalStyles).toContain(".about-update{display:flex");
    expect(declarations(".about-dialog .about-update")).toContain("grid-template-columns: 31px minmax(0, 1fr) auto");
    expect(declarations(".update-check-dialog .dialog-header")).toContain("padding: 13px 15px 11px");
    expect(declarations(".update-check-dialog .dialog-content")).toContain("padding: 12px 14px 14px");
    expect(declarations(".update-check-status")).toContain("min-height: 82px");
    expect(declarations(".update-check-status")).toContain("grid-template-columns: 34px minmax(0, 1fr) auto");
    expect(declarations(".update-check-status-actions")).toContain("display: flex");
    expect(styles).not.toContain(".update-check-actions");
  });

  it("presents the Homebrew command as a persistent monospace copy surface", () => {
    expect(declarations(".update-check-command")).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(declarations(".update-check-command code")).toContain("font-family: var(--terminal-font-family)");
    expect(declarations(".update-check-homebrew")).toContain("padding: 10px");
    expect(declarations(".update-check-copy")).toContain("height: 26px");
    expect(styles).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.update-check-status-icon\.checking svg[\s\S]*animation: none/);
  });

  it("keeps every update-state icon on semantic theme roles", () => {
    expect(styles).toMatch(/\.update-check-status\[data-status="latest"\] \.update-check-status-icon\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--accent\)[^}]*color:\s*var\(--accent\)[^}]*background:\s*var\(--accent-bg\)/);
    expect(styles).toMatch(/\.update-check-status\[data-status="available"\] \.update-check-status-icon\s*\{[^}]*var\(--signature\)[^}]*color:\s*var\(--signature\)/);
    expect(styles).toMatch(/\.update-check-status\[data-status="error"\] \.update-check-status-icon\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--danger\)[^}]*color:\s*var\(--danger\)[^}]*background:\s*var\(--danger-bg\)/);
  });

  it("separates branded primary actions from cyan utility actions", () => {
    expect(declarations(".about-update-action.ui-button--primary")).toContain("background:var(--primary-action)");
    expect(declarations('.update-check-status[data-status="available"]')).toContain("box-shadow:inset 2px 0 var(--signature)");
    expect(declarations(".update-check-release.ui-button--primary")).toContain("background:var(--primary-action)");
    expect(styles).toMatch(/\.update-check-copy,\s*\.update-check-recheck\s*\{[^}]*background:\s*var\(--control-bg\)/);
    expect(declarations(".about-product-mark")).toContain("color:var(--signature)");
  });
});
