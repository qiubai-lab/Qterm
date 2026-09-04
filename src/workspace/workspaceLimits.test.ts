import { expect, it } from "vitest";
import { createWorkspace, createWorkspaceDocument } from "./model";
import { workspaceReducer } from "./reducer";
import { MAX_WORKSPACES } from "./workspaceLimits";

it("allows the tenth workspace and rejects further creation through the shared reducer", () => {
  let state = createWorkspaceDocument();
  for (let i = 1; i < MAX_WORKSPACES; i++) state = workspaceReducer(state, { type: "addWorkspace" });
  expect(state.workspaces).toHaveLength(10);
  expect(workspaceReducer(state, { type: "addWorkspace" })).toBe(state);
  state = workspaceReducer(state, { type: "closeWorkspace", workspaceId: state.activeWorkspaceId });
  expect(state.workspaces).toHaveLength(9);
  expect(workspaceReducer(state, { type: "addWorkspace" }).workspaces).toHaveLength(10);
});
it("preserves older documents over the limit while preventing additions", () => {
  const state = { ...createWorkspaceDocument(), workspaces: Array.from({ length: 11 }, (_, i) => createWorkspace(`工作区-${i + 1}`)) };
  expect(workspaceReducer(state, { type: "addWorkspace" })).toBe(state);
});
