import { describe, expect, it } from "vitest";

import { blockIds } from "./layout";
import { createWorkspaceDocument } from "./model";
import { workspaceReducer } from "./reducer";

describe("workspace reducer", () => {
  it("keeps six unique remote profiles in most-recent-first order", () => {
    let state = createWorkspaceDocument();
    for (const profileId of ["profile-1", "profile-2", "profile-3", "profile-4", "profile-5", "profile-6", "profile-7"]) {
      state = workspaceReducer(state, { type: "recordRecentProfile", profileId });
    }
    expect(state.recentProfileIds).toEqual(["profile-7", "profile-6", "profile-5", "profile-4", "profile-3", "profile-2"]);

    state = workspaceReducer(state, { type: "recordRecentProfile", profileId: "profile-4" });
    expect(state.recentProfileIds).toEqual(["profile-4", "profile-7", "profile-6", "profile-5", "profile-3", "profile-2"]);
    expect(workspaceReducer(state, { type: "recordRecentProfile", profileId: null })).toBe(state);
  });

  it("keeps at least one workspace and terminal block", () => {
    const initial = createWorkspaceDocument();
    const workspace = initial.workspaces[0];
    expect(workspaceReducer(initial, { type: "closeWorkspace", workspaceId: workspace.id })).toEqual(initial);
    expect(workspaceReducer(initial, { type: "closeBlock", workspaceId: workspace.id, blockId: workspace.activeBlockId })).toEqual(initial);
  });

  it("does not recreate a workspace when selecting its already active block", () => {
    const initial = createWorkspaceDocument();
    const workspace = initial.workspaces[0];
    expect(workspaceReducer(initial, { type: "selectBlock", workspaceId: workspace.id, blockId: workspace.activeBlockId })).toBe(initial);

    const split = workspaceReducer(initial, {
      type: "splitBlock",
      workspaceId: workspace.id,
      blockId: workspace.activeBlockId,
      direction: "horizontal",
      newBlockId: "block-child",
      splitId: "split-child",
    });
    const splitWorkspace = split.workspaces[0];
    expect(workspaceReducer(split, { type: "selectBlock", workspaceId: workspace.id, blockId: splitWorkspace.activeBlockId })).toBe(split);

    const previousBlockId = blockIds(splitWorkspace.layout).find((blockId) => blockId !== splitWorkspace.activeBlockId);
    expect(previousBlockId).toBeDefined();
    const changed = workspaceReducer(split, { type: "selectBlock", workspaceId: workspace.id, blockId: previousBlockId! });
    expect(changed).not.toBe(split);
    expect(changed.workspaces[0].activeBlockId).toBe(previousBlockId);
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
    const profiled = workspaceReducer(initial, { type: "setBlockProfile", workspaceId: workspace.id, blockId: workspace.activeBlockId, profileId: "profile-1" });
    const split = workspaceReducer(profiled, {
      type: "splitBlock",
      workspaceId: workspace.id,
      blockId: workspace.activeBlockId,
      direction: "horizontal",
      newBlockId: "block-child",
      splitId: "split-child",
    });
    const splitWorkspace = split.workspaces[0];
    expect(blockIds(splitWorkspace.layout)).toHaveLength(2);
    expect(splitWorkspace.activeBlockId).toBe("block-child");
    expect(splitWorkspace.layout).toMatchObject({ id: "split-child", second: { type: "terminal", blockId: "block-child", profileId: "profile-1" } });

    expect(workspaceReducer(profiled, {
      type: "splitBlock",
      workspaceId: workspace.id,
      blockId: "missing-block",
      direction: "horizontal",
      newBlockId: "orphan-block",
      splitId: "orphan-split",
    })).toEqual(profiled);
    const closed = workspaceReducer(split, { type: "closeBlock", workspaceId: workspace.id, blockId: splitWorkspace.activeBlockId });
    const closedWorkspace = closed.workspaces[0];
    expect(blockIds(closedWorkspace.layout)).toHaveLength(1);
    expect(blockIds(closedWorkspace.layout)).toContain(closedWorkspace.activeBlockId);
  });

  it("persists a terminal restore directory idempotently and clears it across target changes", () => {
    const initial = createWorkspaceDocument();
    const workspace = initial.workspaces[0];
    const blockId = workspace.activeBlockId;
    const restored = workspaceReducer(initial, { type: "setTerminalRestoreDirectory", workspaceId: workspace.id, blockId, profileId: null, restoreDirectory: "/srv/project" });

    expect(restored.workspaces[0].layout).toMatchObject({ type: "terminal", blockId, profileId: null, restoreDirectory: "/srv/project" });
    expect(workspaceReducer(restored, { type: "setTerminalRestoreDirectory", workspaceId: workspace.id, blockId, profileId: null, restoreDirectory: "/srv/project" })).toBe(restored);
    expect(workspaceReducer(restored, { type: "setTerminalRestoreDirectory", workspaceId: workspace.id, blockId, profileId: "profile-stale", restoreDirectory: "/wrong" })).toBe(restored);
    expect(workspaceReducer(restored, { type: "setTerminalRestoreDirectory", workspaceId: workspace.id, blockId, profileId: null, restoreDirectory: "x".repeat(4097) })).toBe(restored);
    expect(workspaceReducer(restored, { type: "setTerminalRestoreDirectory", workspaceId: workspace.id, blockId, profileId: null, restoreDirectory: "/has\0nul" })).toBe(restored);

    const retargeted = workspaceReducer(restored, { type: "setBlockProfile", workspaceId: workspace.id, blockId, profileId: "profile-1" });
    expect(retargeted.workspaces[0].layout).toMatchObject({ type: "terminal", profileId: "profile-1", restoreDirectory: null });

    const remote = workspaceReducer(retargeted, { type: "setTerminalRestoreDirectory", workspaceId: workspace.id, blockId, profileId: "profile-1", restoreDirectory: "/remote" });
    const cleared = workspaceReducer(remote, { type: "clearTerminalRestoreDirectories" });
    expect(cleared.workspaces[0].layout).toMatchObject({ type: "terminal", profileId: "profile-1", restoreDirectory: null });
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

  it("opens and retargets a persisted Git leaf", () => {
    const initial = createWorkspaceDocument();
    const workspace = initial.workspaces[0];
    const opened = workspaceReducer(initial, {
      type: "openGit",
      workspaceId: workspace.id,
      anchorBlockId: workspace.activeBlockId,
      target: { type: "local", path: "D:/work/project" },
    });
    const current = opened.workspaces[0];
    expect(current.activeBlockId).toMatch(/^git-/);
    expect(current.layout).toMatchObject({ second: { type: "git", target: { type: "local", path: "D:/work/project" } } });

    const retargeted = workspaceReducer(opened, {
      type: "setGitTarget",
      workspaceId: workspace.id,
      blockId: current.activeBlockId,
      target: { type: "remote", profileId: "profile-1", path: "/srv/project" },
    });
    expect(retargeted.workspaces[0].layout).toMatchObject({ second: { type: "git", target: { type: "remote", profileId: "profile-1", path: "/srv/project" } } });
  });
});
