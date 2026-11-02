import { expect, it } from "vitest";
import { readCssBundle } from "../../test/css";
const styles = readCssBundle("src/server/accessLog/accessLog.css");

it("makes the log viewport scrollable rather than merely clipping oversized contents", () => {
  const viewport = styles.match(/\.access-log-viewport\s*\{([^}]+)\}/)?.[1];
  expect(viewport).toMatch(/overflow:\s*auto/);
  expect(styles).toMatch(/prefers-reduced-motion:reduce[^}]*access-log-skeleton[^}]*animation:none/);
});
