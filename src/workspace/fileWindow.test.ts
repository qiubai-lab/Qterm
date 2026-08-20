import { describe, expect, it } from "vitest";

import type { Workspace } from "./model";
import { openFileWindowAction } from "./fileWindow";

describe("openFileWindowAction", () => {
  it("always opens a local files window from an active remote terminal", () => {
    const workspace: Workspace = { id: "w", name: "W", activeBlockId: "t", layout: { type: "terminal", blockId: "t", profileId: "p" } };
    expect(openFileWindowAction(workspace)).toEqual({
      type: "openFiles", workspaceId: "w", anchorBlockId: "t", profileId: null, path: "~",
    });
  });

  it("opens another local files window from an active remote files window", () => {
    const workspace: Workspace = { id: "w", name: "W", activeBlockId: "f", layout: { type: "files", blockId: "f", profileId: "p", path: "/srv" } };
    expect(openFileWindowAction(workspace)).toEqual({
      type: "openFiles", workspaceId: "w", anchorBlockId: "f", profileId: null, path: "~",
    });
  });
});
