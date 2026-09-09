import { describe, expect, it } from "vitest";

import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

describe("file toolbar responsive styles", () => {
  it("collapses secondary controls in priority order before editor actions", () => {
    const experimentalCollapse = styles.indexOf("@container file-preview-document (max-width:440px){.file-experimental-badge{display:none}}");
    const secondaryCollapse = styles.indexOf("@container file-preview-document (max-width:340px)");
    const searchCollapse = styles.indexOf('@container file-preview-document (max-width:280px){.file-preview-toolbar[data-mode="edit"] .file-search-button{display:none}}');

    expect(experimentalCollapse).toBeGreaterThan(-1);
    expect(secondaryCollapse).toBeGreaterThan(experimentalCollapse);
    expect(styles.slice(secondaryCollapse)).toContain(".file-view-mode{display:none}");
    expect(searchCollapse).toBeGreaterThan(secondaryCollapse);
  });
});
