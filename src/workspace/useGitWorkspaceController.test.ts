import { describe, expect, it } from "vitest";

import { canReuseGitRemoteSession, restoreGitTargetIntent, stageGitRemoteTargetIntent } from "./useGitWorkspaceController";
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

  it("reuses a connected session prepared for the selected remote profile", () => {
    expect(canReuseGitRemoteSession(
      { type: "unbound" },
      { type: "remote", profileId: "profile-1", path: "/srv/project" },
      connected,
      "profile-1",
    )).toBe(true);
    expect(canReuseGitRemoteSession(
      { type: "unbound" },
      { type: "remote", profileId: "profile-2", path: "/srv/project" },
      connected,
      "profile-1",
    )).toBe(false);
  });

  it("stages and restores Git connection intent without changing a persisted target", () => {
    const intents = new Map<string, string | null>();
    expect(restoreGitTargetIntent(intents, "git-1", { type: "remote", profileId: "profile-1", path: "/srv/current" })).toBe(false);
    stageGitRemoteTargetIntent(intents, "git-1", "profile-2");
    expect(intents.get("git:git-1")).toBe("profile-2");

    expect(restoreGitTargetIntent(intents, "git-1", { type: "remote", profileId: "profile-1", path: "/srv/current" })).toBe(true);
    expect(intents.get("git:git-1")).toBe("profile-1");
    expect(restoreGitTargetIntent(intents, "git-1", { type: "local", path: "/work" })).toBe(true);
    expect(intents.get("git:git-1")).toBeNull();
  });
});
