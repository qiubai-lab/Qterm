import { describe, expect, it } from "vitest";

import type { Workspace } from "./model";
import { openNetworkWindowAction } from "./networkWindow";

describe("openNetworkWindowAction", () => {
  const workspace: Workspace = {
    id: "workspace-1",
    name: "Workspace",
    activeBlockId: "terminal-1",
    layout: { type: "terminal", blockId: "terminal-1", profileId: "profile-1" },
  };

  it("creates a network leaf beside the active block with an optional inherited profile", () => {
    expect(openNetworkWindowAction(workspace)).toEqual({ type: "openNetwork", workspaceId: "workspace-1", anchorBlockId: "terminal-1", profileId: null });
    expect(openNetworkWindowAction(workspace, "profile-1")).toEqual({ type: "openNetwork", workspaceId: "workspace-1", anchorBlockId: "terminal-1", profileId: "profile-1" });
  });
});
