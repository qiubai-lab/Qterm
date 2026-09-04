import { describe, expect, it } from "vitest";
import { createWorkspace, createWorkspaceDocument } from "./model";
import { workspaceReducer } from "./reducer";
import { workspaceCloseTargets } from "./workspaceClose";
const workspaces = ["a", "b", "c", "d"].map(id => ({ ...createWorkspace(id), id }));
describe("workspace batch closing", () => {
  it("uses visible ordering and excludes the anchor for each side", () => {
    expect(workspaceCloseTargets(workspaces, "b", "left").map(item => item.id)).toEqual(["a"]);
    expect(workspaceCloseTargets(workspaces, "b", "right").map(item => item.id)).toEqual(["c", "d"]);
    expect(workspaceCloseTargets(workspaces, "b", "others").map(item => item.id)).toEqual(["a", "c", "d"]);
    expect(workspaceCloseTargets([...workspaces].reverse(), "b", "left").map(item => item.id)).toEqual(["d", "c"]);
    expect(workspaceCloseTargets(workspaces, "missing", "others")).toEqual([]);
  });
  it("atomically preserves anchor and selects it when the current workspace closes", () => {
    const initial = { ...createWorkspaceDocument(), workspaces, activeWorkspaceId: "a" };
    const result = workspaceReducer(initial, { type: "closeWorkspaces", workspaceIds: ["a", "b", "c", "missing"], anchorId: "b" });
    expect(result.workspaces.map(item => item.id)).toEqual(["b", "d"]);
    expect(result.activeWorkspaceId).toBe("b");
    const preserved = workspaceReducer({ ...initial, activeWorkspaceId: "d" }, { type: "closeWorkspaces", workspaceIds: ["a", "c"], anchorId: "b" });
    expect(preserved.activeWorkspaceId).toBe("d");
    expect(workspaceReducer(initial, { type: "closeWorkspaces", workspaceIds: ["a", "b", "c", "d"], anchorId: "missing" })).toBe(initial);
  });
});
