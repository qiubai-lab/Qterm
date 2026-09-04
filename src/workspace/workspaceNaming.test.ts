import { describe, expect, it } from "vitest";
import { createWorkspace, createWorkspaceDocument } from "./model";
import { workspaceReducer } from "./reducer";

describe("default workspace numbering", () => {
  it.each([
    [["工作区-2"], "工作区-1"],
    [["工作区-1", "工作区-3"], "工作区-2"],
    [["开发环境", "生产环境"], "工作区-1"],
    [["工作区-1", "工作区-2"], "工作区-3"],
    [["工作区-2", "工作区-3", "工作区-4", "工作区-4"], "工作区-1"],
  ])("finds the first available name among %j", (names, expected) => {
    const workspaces = names.map(name => createWorkspace(name));
    const initial = { ...createWorkspaceDocument(), workspaces, activeWorkspaceId: workspaces[0].id };
    const added = workspaceReducer(initial, { type: "addWorkspace" });
    expect(added.workspaces[added.workspaces.length - 1]?.name).toBe(expected);
    expect(added.workspaces.slice(0, -1)).toEqual(workspaces);
    expect(added.activeWorkspaceId).toBe(added.workspaces[added.workspaces.length - 1]?.id);
  });

  it("reuses closed numbers and respects names assigned by the user", () => {
    let state = createWorkspaceDocument();
    state = workspaceReducer(state, { type: "addWorkspace" });
    state = workspaceReducer(state, { type: "addWorkspace" });
    state = workspaceReducer(state, { type: "closeWorkspace", workspaceId: state.workspaces[1].id });
    state = workspaceReducer(state, { type: "addWorkspace" });
    expect(state.workspaces.map(item => item.name)).toEqual(["工作区-1", "工作区-3", "工作区-2"]);
    state = workspaceReducer(state, { type: "renameWorkspace", workspaceId: state.workspaces[0].id, name: "生产环境" });
    state = workspaceReducer(state, { type: "addWorkspace" });
    expect(state.workspaces[state.workspaces.length - 1]?.name).toBe("工作区-1");
    state = workspaceReducer(state, { type: "renameWorkspace", workspaceId: state.workspaces[0].id, name: "工作区-4" });
    state = workspaceReducer(state, { type: "addWorkspace" });
    expect(state.workspaces[state.workspaces.length - 1]?.name).toBe("工作区-5");
  });
});
