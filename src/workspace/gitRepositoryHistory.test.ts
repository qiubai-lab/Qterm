import { describe, expect, it } from "vitest";

import type { GitRepositoryHistoryEntry } from "./model";
import {
  MAX_RECENT_GIT_REPOSITORIES,
  MAX_RECENT_GIT_REPOSITORIES_PER_SCOPE,
  recentGitRepositoriesForScope,
  recordRecentGitRepository,
} from "./gitRepositoryHistory";

function local(path: string): GitRepositoryHistoryEntry {
  return { type: "local", path };
}

function remote(profileId: string, path: string): GitRepositoryHistoryEntry {
  return { type: "remote", profileId, path };
}

describe("Git repository history", () => {
  it("filters local and remote scopes without exposing another connection", () => {
    const history = [
      remote("profile-2", "/srv/two"),
      local("D:/work/local"),
      remote("profile-1", "/srv/one"),
      remote("profile-1", "/srv/older"),
    ];

    expect(recentGitRepositoriesForScope(history, { type: "local" })).toEqual([local("D:/work/local")]);
    expect(recentGitRepositoriesForScope(history, { type: "remote", profileId: "profile-1" })).toEqual([
      remote("profile-1", "/srv/one"),
      remote("profile-1", "/srv/older"),
    ]);
    expect(recentGitRepositoriesForScope(history, { type: "remote", profileId: "missing" })).toEqual([]);
  });

  it("moves an exact repository identity to the front without merging scopes", () => {
    const history = [
      remote("profile-1", "/srv/app"),
      local("/srv/app"),
      remote("profile-2", "/srv/app"),
      remote("profile-1", "/srv/other"),
    ];

    expect(recordRecentGitRepository(history, remote("profile-1", "/srv/other"))).toEqual([
      remote("profile-1", "/srv/other"),
      remote("profile-1", "/srv/app"),
      local("/srv/app"),
      remote("profile-2", "/srv/app"),
    ]);
  });

  it("keeps only the eight newest entries in each scope while preserving mixed MRU order", () => {
    let history: GitRepositoryHistoryEntry[] = [];
    for (let index = 0; index < MAX_RECENT_GIT_REPOSITORIES_PER_SCOPE + 2; index += 1) {
      history = recordRecentGitRepository(history, remote("profile-1", `/srv/repo-${index}`));
      history = recordRecentGitRepository(history, local(`/local/repo-${index}`));
    }

    expect(recentGitRepositoriesForScope(history, { type: "remote", profileId: "profile-1" })).toEqual(
      Array.from({ length: 8 }, (_, index) => remote("profile-1", `/srv/repo-${9 - index}`)),
    );
    expect(recentGitRepositoriesForScope(history, { type: "local" })).toEqual(
      Array.from({ length: 8 }, (_, index) => local(`/local/repo-${9 - index}`)),
    );
    expect(history.slice(0, 4)).toEqual([
      local("/local/repo-9"),
      remote("profile-1", "/srv/repo-9"),
      local("/local/repo-8"),
      remote("profile-1", "/srv/repo-8"),
    ]);
  });

  it("keeps the newest sixty-four entries globally using deterministic MRU order", () => {
    let history: GitRepositoryHistoryEntry[] = [];
    for (let profileIndex = 0; profileIndex < 9; profileIndex += 1) {
      for (let repositoryIndex = 0; repositoryIndex < 8; repositoryIndex += 1) {
        history = recordRecentGitRepository(
          history,
          remote(`profile-${profileIndex}`, `/srv/${profileIndex}/${repositoryIndex}`),
        );
      }
    }

    expect(history).toHaveLength(MAX_RECENT_GIT_REPOSITORIES);
    expect(history[0]).toEqual(remote("profile-8", "/srv/8/7"));
    expect(history[history.length - 1]).toEqual(remote("profile-1", "/srv/1/0"));
    expect(history.some((entry) => entry.type === "remote" && entry.profileId === "profile-0")).toBe(false);
  });

  it("rejects invalid repository identities without changing the array", () => {
    const history = [local("D:/work/project")];
    const invalid: GitRepositoryHistoryEntry[] = [
      local(""),
      local("bad\npath"),
      local("x".repeat(4097)),
      remote("", "/srv/project"),
      remote("profile bad", "/srv/project"),
      remote("profile-1", "bad\0path"),
    ];

    for (const entry of invalid) {
      expect(recordRecentGitRepository(history, entry)).toBe(history);
    }
  });
});
