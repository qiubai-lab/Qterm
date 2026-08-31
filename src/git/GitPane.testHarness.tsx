import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import type { GitSnapshot } from "../lib/tauri/git";

const api = vi.hoisted(() => ({
  available: vi.fn(), select: vi.fn(), snapshot: vi.fn(), fetch: vi.fn(), pull: vi.fn(), push: vi.fn(), initialize: vi.fn(), stage: vi.fn(), stageAll: vi.fn(), unstage: vi.fn(), unstageAll: vi.fn(), commit: vi.fn(), commitFiles: vi.fn(), createBranch: vi.fn(), createBranchFrom: vi.fn(), renameBranch: vi.fn(), deleteBranch: vi.fn(), switchBranch: vi.fn(), trackRemoteBranch: vi.fn(), mergeBranch: vi.fn(), continueMerge: vi.fn(), abortMerge: vi.fn(), remote: vi.fn(), remoteCommitFiles: vi.fn(),
}));

vi.mock("../lib/tauri/git", () => ({
  gitAvailable: api.available,
  selectGitRepositoryDirectory: api.select,
  loadGitSnapshot: api.snapshot,
  fetchGitRepository: api.fetch,
  pullGitRepository: api.pull,
  pushGitRepository: api.push,
  initializeGitRepository: api.initialize,
  stageGitPaths: api.stage,
  stageAllGitChanges: api.stageAll,
  unstageGitPaths: api.unstage,
  unstageAllGitChanges: api.unstageAll,
  commitGitChanges: api.commit,
  loadGitCommitFiles: api.commitFiles,
  createGitBranch: api.createBranch,
  createGitBranchFrom: api.createBranchFrom,
  renameGitBranch: api.renameBranch,
  deleteGitBranch: api.deleteBranch,
  switchGitBranch: api.switchBranch,
  trackGitRemoteBranch: api.trackRemoteBranch,
  mergeGitBranch: api.mergeBranch,
  continueGitMerge: api.continueMerge,
  abortGitMerge: api.abortMerge,
  executeRemoteGit: api.remote,
  loadRemoteGitCommitFiles: api.remoteCommitFiles,
  gitError: (error: unknown) => error as { code: string; message: string },
}));

const snapshot: GitSnapshot = {
  repositoryPath: "D:/work/project",
  repositoryName: "project",
  head: { name: "main", oid: "abcdef012345", detached: false, unborn: false, upstream: "origin/main", ahead: 1, behind: 0 },
  changes: [
    { path: "src/staged.ts", originalPath: null, status: "M", staged: true, conflict: false },
    { path: "src/new.ts", originalPath: null, status: "U", staged: false, conflict: false },
  ],
  branches: [{ refName: "refs/heads/main", name: "main", kind: "local", oid: "abcdef012345", current: true, upstream: "origin/main", upstreamRef: "refs/remotes/origin/main" }],
  remotes: ["origin"],
  commits: [{ oid: "abcdef012345", parents: [], decorations: ["HEAD -> main"], subject: "feat: initial", body: "Introduces the first Qterm workflow.\n\nKeeps the terminal interaction compact.", author: "Qterm", timestamp: 1_700_000_000 }],
  mergeInProgress: false,
};

function setupGitPaneTests() {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    api.available.mockResolvedValue(true);
    api.snapshot.mockResolvedValue(snapshot);
    api.fetch.mockResolvedValue(snapshot);
    api.pull.mockResolvedValue(snapshot);
    api.push.mockResolvedValue(snapshot);
    api.stage.mockResolvedValue(snapshot);
    api.createBranch.mockResolvedValue(snapshot);
    api.createBranchFrom.mockResolvedValue(snapshot);
    api.renameBranch.mockResolvedValue(snapshot);
    api.deleteBranch.mockResolvedValue(snapshot);
    api.switchBranch.mockResolvedValue(snapshot);
    api.trackRemoteBranch.mockResolvedValue(snapshot);
    api.mergeBranch.mockResolvedValue(snapshot);
    api.continueMerge.mockResolvedValue(snapshot);
    api.abortMerge.mockResolvedValue(snapshot);
    api.commitFiles.mockResolvedValue([
      { path: "src/new-file.ts", originalPath: null, status: "A" },
      { path: "src/renamed.ts", originalPath: "src/old.ts", status: "R100" },
    ]);
    api.remoteCommitFiles.mockResolvedValue([]);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

export { api, deferred, setupGitPaneTests, snapshot };
