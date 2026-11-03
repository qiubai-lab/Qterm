import { expect, it } from "vitest";
import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/remoteRuntime/remoteRuntime.css");

it("keeps long switch errors on one ellipsized line without shrinking the buttons", () => {
  const status = styles.match(/\.runtime-switch-actions \.dialog-action-status\s*\{([^}]+)\}/)?.[1];
  expect(status).toBeDefined();
  for (const rule of ["display:block", "min-width:0", "flex:1 1 0", "overflow:hidden", "white-space:nowrap", "text-overflow:ellipsis", "line-height:30px"]) {
    expect(status).toContain(rule);
  }
  expect(styles).toMatch(/\.runtime-switch-actions > div\s*\{\s*flex:none;/);
});
