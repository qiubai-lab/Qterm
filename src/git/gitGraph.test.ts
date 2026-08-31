import { describe, expect, it } from "vitest";

import type { GitCommit } from "../lib/tauri/git";
import { buildGitGraphRows } from "./gitGraph";

const commit = (oid: string, parents: string[]): GitCommit => ({
  oid,
  parents,
  decorations: [],
  subject: oid,
  body: "",
  author: "Qterm",
  timestamp: 0,
});

describe("buildGitGraphRows", () => {
  it("keeps a linear history in one lane", () => {
    const rows = buildGitGraphRows([commit("c", ["b"]), commit("b", ["a"]), commit("a", [])]);
    expect(rows.map((row) => row.laneCount)).toEqual([1, 1, 1]);
    expect(rows.map((row) => row.currentLane)).toEqual([0, 0, 0]);
    expect(rows.map((row) => row.currentColor)).toEqual([0, 0, 0]);
    expect(rows.map((row) => row.continuingLanes)).toEqual([
      [{ lane: 0, colorIndex: 0 }],
      [{ lane: 0, colorIndex: 0 }],
      [],
    ]);
  });

  it("keeps side-lane colors stable through fork, movement, and merge connections", () => {
    const rows = buildGitGraphRows([
      commit("merge", ["left", "right"]),
      commit("left", ["root"]),
      commit("right", ["root"]),
      commit("root", []),
    ]);

    expect(rows[0].segments.filter((segment) => segment.kind === "parent")).toEqual([
      { from: 0, to: 0, kind: "parent", colorIndex: 0 },
      { from: 0, to: 1, kind: "parent", colorIndex: 1 },
    ]);
    expect(rows[1].segments).toContainEqual({ from: 1, to: 1, kind: "through", colorIndex: 1 });
    expect(rows[2].segments).toContainEqual({ from: 1, to: 0, kind: "parent", colorIndex: 1 });
    expect(rows.map((row) => row.currentColor)).toEqual([0, 0, 1, 0]);
    expect(rows[2].laneCount).toBe(2);
    expect(rows.map((row) => row.laneCount)).toEqual([2, 2, 2, 1]);
    expect(rows.map((row) => row.continuingLanes)).toEqual([
      [{ lane: 0, colorIndex: 0 }, { lane: 1, colorIndex: 1 }],
      [{ lane: 0, colorIndex: 0 }, { lane: 1, colorIndex: 1 }],
      [{ lane: 0, colorIndex: 0 }],
      [],
    ]);
  });

  it("allocates a deterministic six-color palette and avoids equal adjacent lanes when colors wrap", () => {
    const parents = Array.from({ length: 7 }, (_, index) => `parent-${index}`);
    const history = [commit("octopus", parents), ...parents.map((oid) => commit(oid, []))];
    const first = buildGitGraphRows(history);
    const second = buildGitGraphRows(history);
    const colors = first[0].continuingLanes.map((lane) => lane.colorIndex);

    expect(colors).toEqual([0, 1, 2, 3, 4, 5, 0]);
    expect(colors.every((color, index) => index === 0 || color !== colors[index - 1])).toBe(true);
    expect(second).toEqual(first);
  });
});
