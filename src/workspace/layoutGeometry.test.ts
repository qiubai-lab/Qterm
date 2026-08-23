import { describe, expect, it } from "vitest";

import { calculateLayoutGeometry, resolveLayoutBounds } from "./layoutGeometry";
import type { LayoutNode } from "./model";

const layout: LayoutNode = {
  type: "split",
  id: "root",
  direction: "horizontal",
  ratio: 0.4,
  first: { type: "terminal", blockId: "terminal-1", profileId: null },
  second: {
    type: "split",
    id: "right",
    direction: "vertical",
    ratio: 0.5,
    first: { type: "files", blockId: "files-1", profileId: null, path: "/srv" },
    second: { type: "network", blockId: "network-1", profileId: null },
  },
};

describe("flat workspace layout geometry", () => {
  it("reserves exact three-pixel dividers through nested splits", () => {
    const geometry = calculateLayoutGeometry(layout);
    const bounds = Object.fromEntries(geometry.leaves.map(({ node, bounds }) => [node.blockId, resolveLayoutBounds(bounds, 1003, 803)]));

    expect(bounds["terminal-1"]).toEqual({ x: 0, y: 0, width: 400, height: 803 });
    expect(bounds["files-1"]).toEqual({ x: 403, y: 0, width: 600, height: 400 });
    expect(bounds["network-1"]).toEqual({ x: 403, y: 403, width: 600, height: 400 });
    expect(geometry.dividers.map((divider) => [divider.id, resolveLayoutBounds(divider.bounds, 1003, 803)])).toEqual([
      ["root", { x: 400, y: 0, width: 3, height: 803 }],
      ["right", { x: 403, y: 400, width: 600, height: 3 }],
    ]);
  });

  it("uses a live divider ratio without changing stable leaf identities", () => {
    const geometry = calculateLayoutGeometry(layout, { root: 0.25 });
    const terminal = geometry.leaves.find(({ node }) => node.blockId === "terminal-1");
    const files = geometry.leaves.find(({ node }) => node.blockId === "files-1");

    expect(terminal?.node).toBe(layout.first);
    expect(resolveLayoutBounds(terminal!.bounds, 1003, 803)).toEqual({ x: 0, y: 0, width: 250, height: 803 });
    expect(files?.node).toBe(layout.second.type === "split" ? layout.second.first : null);
    expect(resolveLayoutBounds(files!.bounds, 1003, 803).x).toBe(253);
  });
});
