import { describe, expect, it } from "vitest";

import type { GitCommit } from "../lib/tauri/git";
import { buildGitGraphRows } from "./gitGraph";

const commit = (oid: string, parents: string[]): GitCommit => ({
  oid,
  parents,
  decorations: [],
  subject: oid,
  author: "Qterm",
  timestamp: 0,
});

describe("buildGitGraphRows", () => {
  it("keeps a linear history in one lane", () => {
    const rows = buildGitGraphRows([commit("c", ["b"]), commit("b", ["a"]), commit("a", [])]);
    expect(rows.map((row) => row.laneCount)).toEqual([1, 1, 1]);
    expect(rows.map((row) => row.currentLane)).toEqual([0, 0, 0]);
  });

  it("draws distinguishable fork and merge connections", () => {
    const rows = buildGitGraphRows([
      commit("merge", ["left", "right"]),
      commit("left", ["root"]),
      commit("right", ["root"]),
      commit("root", []),
    ]);

    expect(rows[0].segments.filter((segment) => segment.kind === "parent")).toEqual([
      { from: 0, to: 0, kind: "parent" },
      { from: 0, to: 1, kind: "parent" },
    ]);
    expect(rows[1].segments).toContainEqual({ from: 1, to: 1, kind: "through" });
    expect(rows[2].segments).toContainEqual({ from: 1, to: 0, kind: "parent" });
    expect(rows[2].laneCount).toBe(2);
  });
});
