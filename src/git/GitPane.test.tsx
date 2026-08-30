import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitPane } from "./GitPane";
import type { GitSnapshot } from "../lib/tauri/git";

const api = vi.hoisted(() => ({
  available: vi.fn(), select: vi.fn(), snapshot: vi.fn(), initialize: vi.fn(), stage: vi.fn(), stageAll: vi.fn(), unstage: vi.fn(), unstageAll: vi.fn(), commit: vi.fn(), createBranch: vi.fn(), switchBranch: vi.fn(), remote: vi.fn(),
}));

vi.mock("../lib/tauri/git", () => ({
  gitAvailable: api.available,
  selectGitRepositoryDirectory: api.select,
  loadGitSnapshot: api.snapshot,
  initializeGitRepository: api.initialize,
  stageGitPaths: api.stage,
  stageAllGitChanges: api.stageAll,
  unstageGitPaths: api.unstage,
  unstageAllGitChanges: api.unstageAll,
  commitGitChanges: api.commit,
  createGitBranch: api.createBranch,
  switchGitBranch: api.switchBranch,
  executeRemoteGit: api.remote,
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
  branches: [{ name: "main", oid: "abcdef012345", current: true, upstream: "origin/main" }],
  commits: [{ oid: "abcdef012345", parents: [], decorations: ["HEAD -> main"], subject: "feat: initial", author: "Qterm", timestamp: 1_700_000_000 }],
};

describe("GitPane", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    api.available.mockResolvedValue(true);
    api.snapshot.mockResolvedValue(snapshot);
  });

  it("shows a recoverable unbound state and selects a local directory", async () => {
    api.select.mockResolvedValue("D:/work/project");
    const onPath = vi.fn();
    render(<GitPane blockId="git-1" target={{ type: "unbound" }} visible onTargetChange={onPath}/>);
    fireEvent.click(await screen.findByRole("button", { name: "选择文件夹" }));
    await waitFor(() => expect(onPath).toHaveBeenCalledWith({ type: "local", path: "D:/work/project" }));
  });

  it("renders repository changes and graph without exposing a diff action", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    expect(await screen.findByText("project")).toBeInTheDocument();
    expect(screen.getByText("src/staged.ts")).toBeInTheDocument();
    expect(screen.getByText("src/new.ts")).toBeInTheDocument();
    expect(screen.getByText("feat: initial")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /diff|比较|查看改动/i })).not.toBeInTheDocument();
  });

  it("keeps a failed commit message and can retry", async () => {
    api.commit.mockRejectedValueOnce({ code: "gitCommandFailed", message: "缺少 user.email" }).mockResolvedValueOnce({ ...snapshot, changes: [] });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("src/staged.ts");
    const message = screen.getByRole("textbox", { name: "提交消息" });
    fireEvent.change(message, { target: { value: "feat: keep me" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("缺少 user.email");
    expect(message).toHaveValue("feat: keep me");
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    await waitFor(() => expect(message).toHaveValue(""));
  });

  it("offers explicit initialization for a non-repository directory", async () => {
    api.snapshot.mockRejectedValue({ code: "notGitRepository", message: "not a repository" });
    api.initialize.mockResolvedValue(snapshot);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    fireEvent.click(await screen.findByRole("button", { name: "初始化存储库" }));
    await waitFor(() => expect(api.initialize).toHaveBeenCalledWith("D:/work/project"));
    expect(await screen.findByText("project")).toBeInTheDocument();
  });

  it("keeps the newest snapshot when an earlier refresh finishes late", async () => {
    const first = deferred<GitSnapshot>();
    const second = deferred<GitSnapshot>();
    api.snapshot.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(1));
    fireEvent.focus(window);
    await waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(2));

    second.resolve({ ...snapshot, repositoryName: "newest-project" });
    expect(await screen.findByText("newest-project")).toBeInTheDocument();
    first.resolve({ ...snapshot, repositoryName: "stale-project" });
    await waitFor(() => expect(screen.queryByText("stale-project")).not.toBeInTheDocument());
    expect(screen.getByText("newest-project")).toBeInTheDocument();
  });

  it("routes remote snapshots and mutations through the owned Git session", async () => {
    const remoteSnapshot = { ...snapshot, repositoryPath: "/srv/project" };
    api.remote.mockResolvedValue(remoteSnapshot);
    render(<GitPane
      blockId="git-remote"
      target={{ type: "remote", profileId: "profile-1", path: "/srv/project" }}
      runtime={{ sessionId: "git-session", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null, stale: false }}
      visible
      onTargetChange={vi.fn()}
    />);
    await waitFor(() => expect(api.remote).toHaveBeenCalledWith("git-session", "profile-1", { type: "snapshot", path: "/srv/project" }));
    fireEvent.click(await screen.findByRole("button", { name: "暂存 src/new.ts" }));
    await waitFor(() => expect(api.remote).toHaveBeenCalledWith("git-session", "profile-1", { type: "stage", repository: "/srv/project", paths: ["src/new.ts"] }));
    expect(api.snapshot).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
