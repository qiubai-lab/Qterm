import { describe, expect, it } from "vitest";

import { blockIds, closeTerminal, moveTerminal, splitTerminal, updateSplitRatio } from "./layout";
import type { FilesNode, LayoutNode, TerminalNode } from "./model";

const a: TerminalNode = { type: "terminal", blockId: "a", profileId: null };
const b: TerminalNode = { type: "terminal", blockId: "b", profileId: "profile-b" };

describe("workspace layout tree", () => {
  it("splits, clamps ratios, and collapses a closed branch", () => {
    const split = splitTerminal(a, "a", "horizontal", b, "split-1");
    expect(blockIds(split)).toEqual(["a", "b"]);
    expect(updateSplitRatio(split, "split-1", 0.99)).toMatchObject({ ratio: 0.85 });
    expect(closeTerminal(split, "a")).toEqual(b);
  });

  it("moves a terminal to an edge without duplicating identities", () => {
    const c: TerminalNode = { type: "terminal", blockId: "c", profileId: null };
    const tree = splitTerminal(splitTerminal(a, "a", "horizontal", b, "s1"), "b", "vertical", c, "s2");
    const moved = moveTerminal(tree, "a", "c", "bottom", "s3");
    expect(blockIds(moved).sort()).toEqual(["a", "b", "c"]);
    expect(new Set(blockIds(moved)).size).toBe(3);
  });

  it("swaps terminal leaves for a center drop", () => {
    const tree: LayoutNode = { type: "split", id: "s1", direction: "horizontal", ratio: 0.5, first: a, second: b };
    const swapped = moveTerminal(tree, "a", "b", "center", "unused");
    expect(blockIds(swapped)).toEqual(["b", "a"]);
  });

  it("treats a files pane as a movable layout leaf", () => {
    const files: FilesNode = { type: "files", blockId: "files-a", profileId: null, path: "/srv" };
    const tree = splitTerminal(a, "a", "horizontal", files, "s1");
    expect(blockIds(tree)).toEqual(["a", "files-a"]);
    expect(blockIds(moveTerminal(tree, "files-a", "a", "left", "s2"))).toEqual(["files-a", "a"]);
  });
});
