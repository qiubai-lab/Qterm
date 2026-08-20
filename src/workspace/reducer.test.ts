import { describe, expect, it } from "vitest";

import { blockIds } from "./layout";
import { createWorkspaceDocument } from "./model";
import { workspaceReducer } from "./reducer";

describe("workspace reducer", () => {
  it("keeps at least one workspace and terminal block", () => {
    const initial = createWorkspaceDocument();
    const workspace = initial.workspaces[0];
    expect(workspaceReducer(initial, { type: "closeWorkspace", workspaceId: workspace.id })).toEqual(initial);
    expect(workspaceReducer(initial, { type: "closeBlock", workspaceId: workspace.id, blockId: workspace.activeBlockId })).toEqual(initial);
  });

  it("creates and reorders isolated workspace identities", () => {
    const initial = createWorkspaceDocument();
    const firstId = initial.workspaces[0].id;
    const added = workspaceReducer(initial, { type: "addWorkspace" });
    const secondId = added.activeWorkspaceId;
    expect(added.workspaces).toHaveLength(2);
    expect(new Set(added.workspaces.map((workspace) => workspace.id)).size).toBe(2);
    expect(new Set(added.workspaces.flatMap((workspace) => blockIds(workspace.layout))).size).toBe(2);
    const reordered = workspaceReducer(added, { type: "reorderWorkspace", workspaceId: secondId, targetWorkspaceId: firstId });
    expect(reordered.workspaces.map((workspace) => workspace.id)).toEqual([secondId, firstId]);
    expect(reordered.activeWorkspaceId).toBe(secondId);
  });

  it("splits and closes a block while preserving a valid active block", () => {
    const initial = createWorkspaceDocument();
    const workspace = initial.workspaces[0];
    const split = workspaceReducer(initial, { type: "splitBlock", workspaceId: workspace.id, blockId: workspace.activeBlockId, direction: "horizontal" });
    const splitWorkspace = split.workspaces[0];
    expect(blockIds(splitWorkspace.layout)).toHaveLength(2);
    const closed = workspaceReducer(split, { type: "closeBlock", workspaceId: workspace.id, blockId: splitWorkspace.activeBlockId });
    const closedWorkspace = closed.workspaces[0];
    expect(blockIds(closedWorkspace.layout)).toHaveLength(1);
    expect(blockIds(closedWorkspace.layout)).toContain(closedWorkspace.activeBlockId);
  });

  it("opens the current path as a persisted files leaf", () => {
    const initial = createWorkspaceDocument();
    const workspace = initial.workspaces[0];
    const opened = workspaceReducer(initial, { type: "openFiles", workspaceId: workspace.id, anchorBlockId: workspace.activeBlockId, profileId: "profile-1", path: "/srv/app" });
    const current = opened.workspaces[0];
    expect(blockIds(current.layout)).toHaveLength(2);
    expect(current.activeBlockId).toMatch(/^files-/);
    expect(current.layout).toMatchObject({ second: { type: "files", profileId: "profile-1", path: "/srv/app" } });
    const navigated = workspaceReducer(opened, { type: "setFilesPath", workspaceId: workspace.id, blockId: current.activeBlockId, profileId: "profile-1", path: "/srv/app/src" });
    expect(navigated.workspaces[0].layout).toMatchObject({ second: { path: "/srv/app/src" } });
    const local = workspaceReducer(navigated, { type: "setFilesProfile", workspaceId: workspace.id, blockId: current.activeBlockId, profileId: null });
    expect(local.workspaces[0].layout).toMatchObject({ second: { type: "files", profileId: null } });
    expect(workspaceReducer(opened, { type: "closeBlock", workspaceId: workspace.id, blockId: workspace.activeBlockId })).toEqual(opened);
  });

  it("ignores a stale path update after the file target changes", () => {
    const initial = createWorkspaceDocument();
    const workspace = initial.workspaces[0];
    const opened = workspaceReducer(initial, { type: "openFiles", workspaceId: workspace.id, anchorBlockId: workspace.activeBlockId, profileId: null, path: "C:\\cache" });
    const current = opened.workspaces[0];
    const remote = workspaceReducer(opened, { type: "setFilesProfile", workspaceId: workspace.id, blockId: current.activeBlockId, profileId: "profile-1" });
    const reset = workspaceReducer(remote, { type: "setFilesPath", workspaceId: workspace.id, blockId: current.activeBlockId, profileId: "profile-1", path: "." });
    const stale = workspaceReducer(reset, { type: "setFilesPath", workspaceId: workspace.id, blockId: current.activeBlockId, profileId: null, path: "C:\\cache" });

    expect(stale.workspaces[0].layout).toMatchObject({ second: { type: "files", profileId: "profile-1", path: "." } });
  });

  it("opens and retargets a persisted network leaf", () => {
    const initial = createWorkspaceDocument();
    const workspace = initial.workspaces[0];
    const opened = workspaceReducer(initial, { type: "openNetwork", workspaceId: workspace.id, anchorBlockId: workspace.activeBlockId, profileId: "profile-1" });
    const current = opened.workspaces[0];
    expect(current.activeBlockId).toMatch(/^network-/);
    expect(current.layout).toMatchObject({ second: { type: "network", profileId: "profile-1" } });
    const retargeted = workspaceReducer(opened, { type: "setNetworkProfile", workspaceId: workspace.id, blockId: current.activeBlockId, profileId: "profile-2" });
    expect(retargeted.workspaces[0].layout).toMatchObject({ second: { type: "network", profileId: "profile-2" } });
  });
});
