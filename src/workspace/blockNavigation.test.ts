import { describe, expect, it } from "vitest";

import type { LayoutNode } from "./model";
import { adjacentBlockId } from "./blockNavigation";

const layout: LayoutNode = {
  type: "split", id: "root", direction: "horizontal", ratio: 0.5,
  first: { type: "terminal", blockId: "left", profileId: null },
  second: {
    type: "split", id: "right", direction: "vertical", ratio: 0.5,
    first: { type: "terminal", blockId: "top-right", profileId: null },
    second: { type: "files", blockId: "bottom-right", profileId: null, path: "~" },
  },
};

describe("block keyboard navigation", () => {
  it("selects the closest block in the requested physical direction", () => {
    expect(adjacentBlockId(layout, "left", "right")).toBe("top-right");
    expect(adjacentBlockId(layout, "top-right", "down")).toBe("bottom-right");
    expect(adjacentBlockId(layout, "bottom-right", "left")).toBe("left");
    expect(adjacentBlockId(layout, "left", "left")).toBeNull();
  });
});
