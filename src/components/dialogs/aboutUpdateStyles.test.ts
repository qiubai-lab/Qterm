// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/components/dialogs/aboutUpdate.css", "utf8");
const globalStyles = readFileSync("src/app/app.css", "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("about update styles", () => {
  it("aligns the update heading and persistent action on the same grid row", () => {
    expect(globalStyles).toContain(".about-update{display:flex");
    expect(declarations(".about-dialog .about-update")).toContain("display: grid");
    expect(declarations(".about-dialog .about-update")).toContain(
      "grid-template-columns: 31px minmax(0, 1fr) auto",
    );
    expect(declarations(".about-update-heading")).toContain("grid-row: 1");
    expect(declarations(".about-update-action")).toContain("grid-row: 1 / 3");
    expect(declarations(".about-update p")).toContain("grid-row: 2");
  });
});
