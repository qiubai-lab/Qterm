import { describe, expect, it } from "vitest";

import type { Workspace } from "./model";
import { openNetworkWindowAction } from "./networkWindow";

describe("openNetworkWindowAction", () => {
  it.each([
    ["terminal", { type: "terminal" as const, blockId: "active", profileId: "profile-1" }],
    ["files", { type: "files" as const, blockId: "active", profileId: "profile-1", path: "/srv" }],
    ["network", { type: "network" as const, blockId: "active", profileId: "profile-1" }],
  ])("inherits the active remote %s connection", (_label, layout) => {
    const workspace: Workspace = { id: "workspace-1", name: "Workspace", activeBlockId: "active", layout };

    expect(openNetworkWindowAction(workspace)).toEqual({
      type: "openNetwork", workspaceId: "workspace-1", anchorBlockId: "active", profileId: "profile-1",
    });
  });

  it("keeps the connection unselected for an active local block", () => {
    const workspace: Workspace = {
      id: "workspace-1",
      name: "Workspace",
      activeBlockId: "terminal-1",
      layout: { type: "terminal", blockId: "terminal-1", profileId: null },
    };

    expect(openNetworkWindowAction(workspace)).toEqual({
      type: "openNetwork", workspaceId: "workspace-1", anchorBlockId: "terminal-1", profileId: null,
    });
  });

  it("falls back to the first valid block when the active block id is stale", () => {
    const workspace: Workspace = {
      id: "workspace-1",
      name: "Workspace",
      activeBlockId: "missing",
      layout: {
        type: "split",
        id: "split-1",
        direction: "horizontal",
        ratio: 0.5,
        first: { type: "files", blockId: "first", profileId: "profile-1", path: "/srv" },
        second: { type: "terminal", blockId: "second", profileId: null },
      },
    };

    expect(openNetworkWindowAction(workspace)).toEqual({
      type: "openNetwork", workspaceId: "workspace-1", anchorBlockId: "first", profileId: "profile-1",
    });
  });
});
