import { describe, expect, it } from "vitest";

import { canReuseGitRemoteSession } from "./useGitWorkspaceController";
import { defaultGitRuntime } from "./workspaceRuntime";

describe("Git workspace session reuse", () => {
  const connected = { ...defaultGitRuntime, status: "connected" as const, sessionId: "git-session" };

  it("reuses only a connected Git-purpose session for a path change on the same profile", () => {
    expect(canReuseGitRemoteSession(
      { type: "remote", profileId: "profile-1", path: "/srv/parent" },
      { type: "remote", profileId: "profile-1", path: "/srv/parent/modules/child" },
      connected,
    )).toBe(true);

    expect(canReuseGitRemoteSession(
      { type: "remote", profileId: "profile-1", path: "/srv/parent" },
      { type: "remote", profileId: "profile-2", path: "/srv/other" },
      connected,
    )).toBe(false);
    expect(canReuseGitRemoteSession(
      { type: "local", path: "/srv/parent" },
      { type: "remote", profileId: "profile-1", path: "/srv/parent/modules/child" },
      connected,
    )).toBe(false);
    expect(canReuseGitRemoteSession(
      { type: "remote", profileId: "profile-1", path: "/srv/parent" },
      { type: "remote", profileId: "profile-1", path: "/srv/parent/modules/child" },
      { ...connected, status: "closed", sessionId: null },
    )).toBe(false);
  });
});
