import { describe, expect, it } from "vitest";

import { readCssBundle } from "../../test/css";

const styles = readCssBundle("src/components/dialogs/credentialDialog.css");

describe("credential list selection styles", () => {
  it("keeps the moving selection surface aligned with the hover row", () => {
    expect(styles).toMatch(/\.credential-list\s*\{[^}]*padding:\s*5px 7px 9px/s);
    expect(styles).toMatch(/\.credential-item\s*\{[^}]*width:\s*100%/s);
    expect(styles).toMatch(/\.credential-selection-indicator\s*\{[^}]*right:\s*7px;\s*left:\s*7px/s);
  });
});
