// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/terminal/terminalSurface.css", "utf8").replace(/\s+/g, "");

describe("connection route node styles", () => {
  it("matches the connection-name hover feedback", () => {
    expect(styles).toContain(".connection-route-node{position:relative;z-index:1;display:grid;width:18px;height:23px;place-items:center;padding:0;border:0;border-radius:4px;color:#74683f;background:transparent;cursor:default;transition:color120msease,background-color120msease}");
    expect(styles).toContain(".connection-route-node:hover{color:var(--selection-marker);background:color-mix(insrgb,var(--selection-marker)11%,transparent)}");
  });
});
