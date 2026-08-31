import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitPane } from "./GitPane";
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

describe("GitPane", () => {
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

  it("shows a recoverable unbound state and delegates repository selection to its owner", async () => {
    const onRequestRepositoryChange = vi.fn();
    render(<GitPane blockId="git-1" target={{ type: "unbound" }} visible onTargetChange={vi.fn()} onRequestRepositoryChange={onRequestRepositoryChange}/>);
    fireEvent.click(await screen.findByRole("button", { name: "选择文件夹" }));
    expect(onRequestRepositoryChange).toHaveBeenCalledOnce();
  });

  it("renders repository changes and graph without exposing a diff action", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    expect(await screen.findByText("project")).toBeInTheDocument();
    expect(screen.getByText("src/staged.ts")).toBeInTheDocument();
    expect(screen.getByText("src/new.ts")).toBeInTheDocument();
    expect(screen.getByText("feat: initial")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /diff|比较|查看改动/i })).not.toBeInTheDocument();
  });

  it("reports a successfully opened local repository once across refresh and mutation snapshots", async () => {
    const onRepositoryOpened = vi.fn();
    render(<GitPane
      blockId="git-1"
      target={{ type: "local", path: "D:/work/project" }}
      visible
      onTargetChange={vi.fn()}
      onRepositoryOpened={onRepositoryOpened}
    />);

    await screen.findByText("project");
    expect(onRepositoryOpened).toHaveBeenCalledOnce();
    expect(onRepositoryOpened).toHaveBeenCalledWith({ type: "local", path: "D:/work/project" });

    fireEvent.focus(window);
    await waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(2));
    expect(api.fetch).not.toHaveBeenCalled();
    expect(onRepositoryOpened).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "暂存 src/new.ts" }));
    await waitFor(() => expect(api.stage).toHaveBeenCalledWith("D:/work/project", ["src/new.ts"]));
    expect(onRepositoryOpened).toHaveBeenCalledTimes(1);
  });

  it("does not report a repository when its snapshot fails", async () => {
    const onRepositoryOpened = vi.fn();
    api.snapshot.mockRejectedValue({ code: "gitCommandFailed", message: "仓库不可访问" });
    render(<GitPane
      blockId="git-1"
      target={{ type: "local", path: "D:/work/missing" }}
      visible
      onTargetChange={vi.fn()}
      onRepositoryOpened={onRepositoryOpened}
    />);

    expect(await screen.findByText("仓库不可访问")).toBeInTheDocument();
    expect(onRepositoryOpened).not.toHaveBeenCalled();
  });

  it("reports each target identity again after switching away and back", async () => {
    const onRepositoryOpened = vi.fn();
    const otherSnapshot = { ...snapshot, repositoryPath: "D:/work/other", repositoryName: "other" };
    api.snapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(otherSnapshot).mockResolvedValueOnce(snapshot);
    const view = render(<GitPane
      blockId="git-1"
      target={{ type: "local", path: "D:/work/project" }}
      visible
      onTargetChange={vi.fn()}
      onRepositoryOpened={onRepositoryOpened}
    />);
    await screen.findByText("project");

    view.rerender(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/other" }} visible onTargetChange={vi.fn()} onRepositoryOpened={onRepositoryOpened}/>);
    await screen.findByText("other");
    view.rerender(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()} onRepositoryOpened={onRepositoryOpened}/>);
    await waitFor(() => expect(onRepositoryOpened).toHaveBeenCalledTimes(3));

    expect(onRepositoryOpened.mock.calls).toEqual([
      [{ type: "local", path: "D:/work/project" }],
      [{ type: "local", path: "D:/work/other" }],
      [{ type: "local", path: "D:/work/project" }],
    ]);
  });

  it("renders a VS Code-style selectable commit graph with branch decorations", async () => {
    api.snapshot.mockResolvedValueOnce({
      ...snapshot,
      commits: [
        snapshot.commits[0],
        { oid: "123456789abc", parents: [], decorations: ["origin/archive"], subject: "fix: older commit", body: "", author: "Koppa", timestamp: 1_690_000_000 },
      ],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const current = screen.getByRole("button", { name: /feat: initial/ });
    const older = screen.getByRole("button", { name: /fix: older commit/ });
    const rail = current.querySelector<HTMLElement>(":scope > .git-graph-rail");
    const card = current.querySelector<HTMLElement>(":scope > .git-commit-card");
    expect(rail).toBeInTheDocument();
    expect(card).toBeInTheDocument();
    expect(card).toContainElement(current.querySelector(".git-commit-content"));
    expect(card).not.toContainElement(rail);
    expect(current).toHaveAttribute("aria-pressed", "true");
    expect(current.querySelector('[data-kind="head"]')).toHaveTextContent("main");
    expect(current.querySelector('[data-kind="head"]')).not.toHaveTextContent("HEAD ->");
    expect(older.querySelector('[data-kind="remote"]')).toHaveTextContent("origin/archive");
    expect(current.querySelector('[data-kind="head"] .git-decoration-label')).toHaveTextContent("main");
    expect(older.querySelector('[data-kind="remote"] .git-decoration-label')).toHaveTextContent("origin/archive");

    fireEvent.click(older);
    expect(older).toHaveAttribute("aria-pressed", "true");
    expect(current).toHaveAttribute("aria-pressed", "false");
  });

  it("shows accessible portaled commit details on hover and keyboard focus without loading files", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const commit = screen.getByRole("button", { name: /feat: initial/ });
    expect(commit).not.toHaveAttribute("title");

    fireEvent.pointerEnter(commit);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.parentElement).toBe(document.body);
    expect(commit).toHaveAttribute("aria-describedby", tooltip.id);
    expect(tooltip).toHaveTextContent("Qterm");
    expect(tooltip).toHaveTextContent("feat: initial");
    expect(tooltip).toHaveTextContent("Introduces the first Qterm workflow.");
    expect(tooltip).toHaveTextContent("Keeps the terminal interaction compact.");
    expect(tooltip).toHaveTextContent("abcdef0");
    expect(tooltip).toHaveTextContent("main");
    expect(tooltip.querySelector("time")).toHaveAttribute("dateTime", "2023-11-14T22:13:20.000Z");
    expect(api.commitFiles).not.toHaveBeenCalled();

    fireEvent.pointerLeave(commit);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(commit);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(commit);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("repositions commit details after viewport and ancestor-scroll changes", async () => {
    let anchorTop = 120;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("git-commit-row")) return {
        top: anchorTop, right: 430, bottom: anchorTop + 36, left: 20, width: 410, height: 36,
        x: 20, y: anchorTop, toJSON: () => ({}),
      } as DOMRect;
      if (this.classList.contains("git-commit-tooltip")) return {
        top: 0, right: 320, bottom: 180, left: 0, width: 320, height: 180,
        x: 0, y: 0, toJSON: () => ({}),
      } as DOMRect;
      return { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
      await screen.findByText("project");
      fireEvent.click(screen.getByRole("button", { name: "图表" }));
      fireEvent.pointerEnter(screen.getByRole("button", { name: /feat: initial/ }));
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveStyle({ left: "436px", top: "120px", visibility: "visible" });

      anchorTop = 180;
      fireEvent.resize(window);
      expect(tooltip).toHaveStyle({ top: "180px" });
      anchorTop = 220;
      fireEvent.scroll(document);
      expect(tooltip).toHaveStyle({ top: "220px" });
    } finally {
      rect.mockRestore();
    }
  });

  it("loads commit files lazily, shows rename context, and reuses the cached result", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const commit = screen.getByRole("button", { name: /feat: initial/ });
    const entry = commit.closest<HTMLElement>(".git-commit-entry");
    const detailsShell = entry?.querySelector<HTMLElement>(".git-commit-details-shell") ?? null;
    expect(detailsShell).toBeInTheDocument();
    expect(detailsShell).not.toHaveClass("expanded");
    expect(detailsShell).toHaveAttribute("aria-hidden", "true");
    expect(detailsShell).toHaveAttribute("inert");
    expect(api.commitFiles).not.toHaveBeenCalled();

    fireEvent.click(commit);
    const files = await screen.findByRole("list", { name: "feat: initial 的文件" });
    expect(detailsShell).toHaveClass("expanded");
    expect(detailsShell).toHaveAttribute("aria-hidden", "false");
    expect(detailsShell).not.toHaveAttribute("inert");
    expect(api.commitFiles).toHaveBeenCalledWith("D:/work/project", "abcdef012345");
    expect(files).toHaveTextContent("new-file.ts");
    expect(files).toHaveTextContent("src");
    expect(files).toHaveTextContent("来自 src/old.ts");
    expect(files.querySelector('[data-tone="added"]')).toHaveTextContent("A");
    expect(files.querySelector('[data-tone="renamed"]')).toHaveTextContent("R");
    expect(screen.queryByRole("button", { name: /diff|比较|查看改动/i })).not.toBeInTheDocument();
    fireEvent.pointerEnter(commit);
    expect(screen.getByRole("tooltip")).toHaveTextContent("2 个文件");
    fireEvent.pointerLeave(commit);

    fireEvent.click(commit);
    expect(screen.queryByRole("list", { name: "feat: initial 的文件" })).not.toBeInTheDocument();
    expect(detailsShell).not.toHaveClass("expanded");
    expect(detailsShell).toHaveAttribute("aria-hidden", "true");
    expect(detailsShell).toHaveAttribute("inert");
    expect(files).toBeInTheDocument();
    fireEvent.click(commit);
    expect(await screen.findByRole("list", { name: "feat: initial 的文件" })).toBeInTheDocument();
    expect(api.commitFiles).toHaveBeenCalledTimes(1);
  });

  it("keeps every live graph lane continuous through expanded commit files", async () => {
    const parent = { oid: "123456789abc", parents: [], decorations: [], subject: "fix: parent", body: "", author: "Koppa", timestamp: 1_690_000_000 };
    const secondParent = { ...parent, oid: "fedcba987654", subject: "fix: second parent" };
    api.snapshot.mockResolvedValueOnce({
      ...snapshot,
      commits: [{ ...snapshot.commits[0], parents: [parent.oid, secondParent.oid] }, parent, secondParent],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const commit = screen.getByRole("button", { name: /feat: initial/ });
    fireEvent.click(commit);
    const files = await screen.findByRole("list", { name: "feat: initial 的文件" });
    const entry = commit.closest<HTMLElement>(".git-commit-entry");
    const details = entry?.querySelector<HTMLElement>(".git-commit-details") ?? null;
    const card = entry?.querySelector<HTMLElement>(".git-commit-card") ?? null;
    const rail = commit.querySelector<HTMLElement>(":scope > .git-graph-rail");
    const railSvg = rail?.querySelector(".git-graph-lanes") ?? null;
    expect(commit.querySelector<HTMLElement>(":scope > .git-commit-card")).toBe(card);
    expect(commit.querySelector<HTMLElement>(":scope > .git-graph-rail")).toBe(rail);
    expect(railSvg).toHaveAttribute("height", "36");
    expect(railSvg).toHaveAttribute("viewBox", "0 0 28 36");
    expect(railSvg?.querySelector("circle")).toHaveAttribute("cy", "18");
    expect(railSvg?.querySelector("circle")).toHaveAttribute("data-color", "0");
    expect(Array.from(railSvg?.querySelectorAll('path[data-kind="parent"]') ?? []).map((path) => path.getAttribute("data-color"))).toEqual(["0", "1"]);
    expect(Array.from(railSvg?.querySelectorAll("path") ?? []).some((path) => path.getAttribute("d")?.endsWith("36"))).toBe(true);
    expect(card).not.toContainElement(rail);
    expect(card).not.toContainElement(details);
    expect(details).toContainElement(files);
    expect(details?.querySelectorAll(".git-graph-continuation line")).toHaveLength(2);
    expect(Array.from(details?.querySelectorAll(".git-graph-continuation line") ?? []).map((line) => line.getAttribute("data-color"))).toEqual(["0", "1"]);
    expect(entry?.querySelectorAll(":scope > .git-graph-bridge line")).toHaveLength(2);
    expect(Array.from(entry?.querySelectorAll(":scope > .git-graph-bridge line") ?? []).map((line) => line.getAttribute("data-color"))).toEqual(["0", "1"]);
  });

  it("sizes each commit, expanded continuation, and bridge from that row's live lanes", async () => {
    const left = { oid: "111111111111", parents: ["333333333333"], decorations: [], subject: "left", body: "", author: "Koppa", timestamp: 1_690_000_004 };
    const right = { oid: "222222222222", parents: ["333333333333"], decorations: [], subject: "right", body: "", author: "Koppa", timestamp: 1_690_000_003 };
    const root = { oid: "333333333333", parents: ["444444444444"], decorations: [], subject: "root", body: "", author: "Koppa", timestamp: 1_690_000_002 };
    const older = { oid: "444444444444", parents: [], decorations: [], subject: "older", body: "", author: "Koppa", timestamp: 1_690_000_001 };
    api.snapshot.mockResolvedValueOnce({
      ...snapshot,
      commits: [{ ...snapshot.commits[0], parents: [left.oid, right.oid] }, left, right, root, older],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));

    const merge = screen.getByRole("button", { name: /feat: initial/ });
    const rootCommit = screen.getByRole("button", { name: /^root/ });
    expect(merge.querySelector(".git-graph-lanes")).toHaveAttribute("viewBox", "0 0 28 36");
    expect(rootCommit.querySelector(".git-graph-lanes")).toHaveAttribute("viewBox", "0 0 17 36");

    fireEvent.click(rootCommit);
    await screen.findByRole("list", { name: "root 的文件" });
    const rootEntry = rootCommit.closest<HTMLElement>(".git-commit-entry");
    expect(rootEntry?.querySelector(".git-graph-continuation svg")).toHaveAttribute("width", "17");
    expect(rootEntry?.querySelector(":scope > .git-graph-bridge svg")).toHaveAttribute("width", "17");
  });

  it("keeps commit-file cache entries isolated by repository", async () => {
    const otherSnapshot = { ...snapshot, repositoryPath: "D:/work/other", repositoryName: "other" };
    api.snapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(otherSnapshot);
    const view = render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    fireEvent.click(screen.getByRole("button", { name: /feat: initial/ }));
    await waitFor(() => expect(api.commitFiles).toHaveBeenCalledWith("D:/work/project", "abcdef012345"));

    view.rerender(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/other" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("other");
    fireEvent.click(screen.getByRole("button", { name: /feat: initial/ }));
    await waitFor(() => expect(api.commitFiles).toHaveBeenCalledWith("D:/work/other", "abcdef012345"));
    expect(api.commitFiles).toHaveBeenCalledTimes(2);
  });

  it("offers an inline retry and empty state when commit files cannot be loaded", async () => {
    api.commitFiles.mockRejectedValueOnce({ code: "gitCommandFailed", message: "读取提交失败" }).mockResolvedValueOnce([]);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    fireEvent.click(screen.getByRole("button", { name: /feat: initial/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("读取提交失败");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("该提交没有可显示的文件变更")).toBeInTheDocument();
    expect(api.commitFiles).toHaveBeenCalledTimes(2);
  });

  it("does not refresh the snapshot when only the target-change callback changes", async () => {
    vi.useFakeTimers();
    try {
      const view = render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      expect(api.snapshot).toHaveBeenCalledTimes(1);

      view.rerender(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      expect(api.snapshot).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders staged and unstaged changes as separate labelled lists", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    const changes = screen.getByRole("list", { name: "Git 更改" });
    expect(changes.querySelectorAll(":scope > .git-change-group")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "暂存的更改" })).toContainElement(screen.getByText("src/staged.ts"));
    expect(screen.getByRole("region", { name: "更改" })).toContainElement(screen.getByText("src/new.ts"));
  });

  it("keeps changes and graph mutually exclusive while preserving their visual order", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    const repository = screen.getByRole("button", { name: "存储库" });
    const changes = screen.getByRole("button", { name: "更改 2" });
    const graph = screen.getByRole("button", { name: "图表" });
    const sectionOrder = () => Array.from(document.querySelectorAll(".git-pane > .git-section")).map((section) => {
      if (section.classList.contains("git-repository-section")) return "repository";
      if (section.classList.contains("git-changes-section")) return "changes";
      return "graph";
    });
    expect(repository).toHaveAttribute("aria-expanded", "true");
    expect(changes).toHaveAttribute("aria-expanded", "true");
    expect(graph).toHaveAttribute("aria-expanded", "false");
    expect(sectionOrder()).toEqual(["repository", "changes", "graph"]);
    expect(graph.closest("section")).toHaveClass("git-graph-section", "collapsed");
    expect(graph.closest("section")?.querySelector(".git-section-body")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(graph);
    expect(graph).toHaveAttribute("aria-expanded", "true");
    expect(changes).toHaveAttribute("aria-expanded", "false");
    expect(changes.closest("section")).toHaveClass("git-changes-section", "collapsed");
    expect(graph.closest("section")).not.toHaveClass("collapsed");
    expect(sectionOrder()).toEqual(["repository", "changes", "graph"]);

    fireEvent.click(changes);
    expect(changes).toHaveAttribute("aria-expanded", "true");
    expect(graph).toHaveAttribute("aria-expanded", "false");
    expect(changes.closest("section")).not.toHaveClass("collapsed");
    expect(graph.closest("section")).toHaveClass("git-graph-section", "collapsed");
    expect(sectionOrder()).toEqual(["repository", "changes", "graph"]);
  });

  it("shows the repository path beside the section title without repeating it in the content", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    const path = screen.getByTitle("D:/work/project");
    expect(path).toHaveClass("git-section-meta");
    expect(path.closest("header")).toHaveClass("git-section-header");
    expect(document.querySelector(".git-path")).not.toBeInTheDocument();
  });

  it("opens the icon-and-text branch chooser in a portaled terminal popover", async () => {
    api.snapshot.mockResolvedValueOnce({
      ...snapshot,
      branches: [
        ...snapshot.branches,
        { refName: "refs/heads/feature/portal", name: "feature/portal", kind: "local", oid: "123456789abc", current: false, upstream: null, upstreamRef: null },
        { refName: "refs/remotes/origin/feature/portal", name: "origin/feature/portal", kind: "remote", oid: "123456789abc", current: false, upstream: null, upstreamRef: null },
      ],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    const repositoryName = await screen.findByText("project");
    const repositoryRow = repositoryName.closest(".git-repository-row");
    const branchTrigger = screen.getByRole("button", { name: "切换分支，当前 main" });
    expect(repositoryRow?.closest(".git-repository-card")).toBeInTheDocument();
    expect(repositoryRow).toContainElement(branchTrigger);
    expect(branchTrigger).toContainElement(branchTrigger.querySelector('[data-icon="git"]'));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建分支" })).not.toBeInTheDocument();
    const refreshButton = screen.getByRole("button", { name: "刷新 Git 状态" });
    const syncStatus = repositoryRow?.querySelector(".git-repository-sync");
    expect(repositoryRow).toContainElement(refreshButton);
    expect(repositoryRow).not.toHaveTextContent("origin/main");
    expect(syncStatus).toHaveTextContent("↑1↓0");
    expect(syncStatus).toHaveAttribute("aria-label", "领先 1 个提交，落后 0 个提交");
    expect(syncStatus!.compareDocumentPosition(refreshButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(branchTrigger);
    const branchDialog = screen.getByRole("dialog", { name: "切换分支" });
    expect(branchDialog.parentElement).toBe(document.body);
    expect(branchDialog).toContainElement(screen.getByRole("button", { name: "创建新分支…" }));
    expect(within(branchDialog).queryByRole("button", { name: "本地分支管理…" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "筛选分支" })).toHaveAttribute("placeholder", "筛选要签出的分支");
    const localGroup = screen.getByRole("group", { name: "本地分支" });
    const remoteGroup = screen.getByRole("group", { name: "远程分支" });
    expect(localGroup).toHaveTextContent("本地分支2");
    expect(remoteGroup).toHaveTextContent("远程分支1");
    const currentBranch = screen.getByRole("option", { name: /main/ });
    expect(currentBranch).toHaveAttribute("aria-selected", "true");
    expect(currentBranch).toHaveTextContent("Qterm");
    expect(currentBranch).toHaveTextContent("abcdef0");
    expect(currentBranch.querySelector(".git-branch-author")).toHaveAttribute("title", "Qterm");
    expect(currentBranch.querySelector(".git-branch-oid")).toHaveAttribute("title", "abcdef012345");
    expect(currentBranch).not.toHaveTextContent("origin/main");
    expect(within(localGroup).getByRole("option", { name: /feature\/portal/ })).toHaveTextContent("本地");
    expect(within(remoteGroup).getByRole("option", { name: /origin\/feature\/portal/ })).toHaveTextContent("远程");
    fireEvent.change(screen.getByRole("searchbox", { name: "筛选分支" }), { target: { value: "feature" } });
    expect(screen.queryByRole("option", { name: /main/ })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "本地分支" })).toHaveTextContent("本地分支1");
    expect(screen.getByRole("group", { name: "远程分支" })).toHaveTextContent("远程分支1");
    fireEvent.click(within(screen.getByRole("group", { name: "本地分支" })).getByRole("option", { name: /feature\/portal/ }));
    await waitFor(() => expect(api.switchBranch).toHaveBeenCalledWith("D:/work/project", "feature/portal"));
    expect(screen.queryByRole("dialog", { name: "切换分支" })).not.toBeInTheDocument();
  });

  it("keeps the branch chooser open while its list scrolls and closes it for outside viewport scrolling", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "切换分支，当前 main" }));

    const branchList = screen.getByRole("listbox", { name: "选择分支" });
    fireEvent.scroll(branchList);
    expect(screen.getByRole("dialog", { name: "切换分支" })).toBeInTheDocument();

    fireEvent.scroll(document);
    expect(screen.queryByRole("dialog", { name: "切换分支" })).not.toBeInTheDocument();
  });

  it("tracks a remote branch by its full ref instead of passing its display name to local switching", async () => {
    api.snapshot.mockResolvedValueOnce({
      ...snapshot,
      branches: [
        ...snapshot.branches,
        { refName: "refs/remotes/origin/feature/portal", name: "origin/feature/portal", kind: "remote", oid: "123456789abc", current: false, upstream: null, upstreamRef: null },
      ],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "切换分支，当前 main" }));
    fireEvent.click(screen.getByRole("option", { name: /origin\/feature\/portal/ }));
    await waitFor(() => expect(api.trackRemoteBranch).toHaveBeenCalledWith("D:/work/project", "refs/remotes/origin/feature/portal"));
    expect(api.switchBranch).not.toHaveBeenCalled();
  });

  it("fetches remote refs only from the manual refresh action and keeps the last snapshot on failure", async () => {
    api.fetch.mockRejectedValueOnce({ code: "gitCommandFailed", message: "origin authentication failed" });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");

    fireEvent.focus(window);
    await waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(2));
    expect(api.fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "刷新 Git 状态" }));
    await waitFor(() => expect(api.fetch).toHaveBeenCalledWith("D:/work/project"));
    expect(await screen.findByRole("alert")).toHaveTextContent("origin authentication failed");
    expect(screen.getByText("project")).toBeInTheDocument();
    expect(screen.getByText("src/staged.ts")).toBeInTheDocument();
  });

  it("does not let a focus snapshot supersede an in-flight manual fetch", async () => {
    const pendingFetch = deferred<GitSnapshot>();
    api.fetch.mockReturnValueOnce(pendingFetch.promise);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    expect(api.snapshot).toHaveBeenCalledTimes(1);

    const refreshButton = screen.getByRole("button", { name: "刷新 Git 状态" });
    expect(refreshButton).not.toHaveAttribute("data-updating");
    fireEvent.click(refreshButton);
    expect(refreshButton).toHaveAttribute("data-updating", "true");
    await waitFor(() => expect(api.fetch).toHaveBeenCalledOnce());
    fireEvent.focus(window);
    expect(api.snapshot).toHaveBeenCalledTimes(1);

    pendingFetch.resolve({ ...snapshot, repositoryName: "fetched-project" });
    expect(await screen.findByText("fetched-project")).toBeInTheDocument();
    expect(refreshButton).not.toHaveAttribute("data-updating");
  });

  it("creates a branch from a separate portaled input popover", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "切换分支，当前 main" }));
    fireEvent.click(screen.getByRole("button", { name: "创建新分支…" }));
    const dialog = screen.getByRole("dialog", { name: "新建分支" });
    expect(dialog.parentElement).toBe(document.body);
    fireEvent.change(screen.getByRole("textbox", { name: "新分支名称" }), { target: { value: "feature/portal" } });
    fireEvent.click(screen.getByRole("button", { name: "创建并切换" }));
    await waitFor(() => expect(api.createBranch).toHaveBeenCalledWith("D:/work/project", "feature/portal"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新建分支" })).not.toBeInTheDocument());
  });

  it("keeps repository retargeting out of the new sync action menu", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    const menu = screen.getByRole("menu", { name: "存储库操作" });
    expect(within(menu).queryByText(/更换.*仓库|选择文件夹/)).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "本地分支管理…" })).toBeInTheDocument();
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "拉取" })).toHaveFocus());
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(within(menu).getByRole("menuitem", { name: "推送" })).toHaveFocus();

    const branchManagement = within(menu).getByRole("menuitem", { name: "本地分支管理…" });
    branchManagement.focus();
    fireEvent.keyDown(branchManagement, { key: "ArrowRight" });
    const submenu = screen.getByRole("menu", { name: "本地分支管理" });
    expect(menu).toBeInTheDocument();
    expect(submenu).toBeInTheDocument();
    expect(branchManagement).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(within(submenu).getByRole("menuitem", { name: "从指定分支创建…" })).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "本地分支管理" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "存储库操作" })).toBeInTheDocument();
    await waitFor(() => expect(branchManagement).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "存储库操作" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Git 仓库操作" })).toHaveFocus());
  });

  it("runs tracked pull, push and sync from a compact repository menu", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");

    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "拉取" }));
    await waitFor(() => expect(api.pull).toHaveBeenCalledWith("D:/work/project"));

    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "推送" }));
    await waitFor(() => expect(api.push).toHaveBeenCalledWith("D:/work/project", null));

    api.pull.mockClear();
    api.push.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "同步" }));
    await waitFor(() => expect(api.push).toHaveBeenCalledOnce());
    expect(api.pull.mock.invocationCallOrder[0]).toBeLessThan(api.push.mock.invocationCallOrder[0]);
  });

  it("publishes an untracked branch to a selected existing remote", async () => {
    api.snapshot.mockResolvedValueOnce({
      ...snapshot,
      head: { ...snapshot.head, upstream: null, ahead: 0, behind: 0 },
      branches: snapshot.branches.map((branch) => ({ ...branch, upstream: null, upstreamRef: null })),
      remotes: ["origin", "mirror"],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "发布分支…" }));
    const dialog = screen.getByRole("dialog", { name: "发布分支" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "目标 remote" }), { target: { value: "mirror" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "发布并设置 upstream" }));
    await waitFor(() => expect(api.push).toHaveBeenCalledWith("D:/work/project", "mirror"));
  });

  it("manages create-from, rename and safe delete through explicit branch forms", async () => {
    const managementSnapshot = {
      ...snapshot,
      branches: [
        ...snapshot.branches,
        { refName: "refs/heads/feature/old", name: "feature/old", kind: "local", oid: "abcdef012345", current: false, upstream: null, upstreamRef: null },
        { refName: "refs/remotes/origin/release", name: "origin/release", kind: "remote", oid: "abcdef012345", current: false, upstream: null, upstreamRef: null },
      ],
    } satisfies GitSnapshot;
    api.snapshot.mockResolvedValueOnce(managementSnapshot);
    api.createBranchFrom.mockResolvedValueOnce(managementSnapshot);
    api.renameBranch.mockResolvedValueOnce(managementSnapshot);
    api.deleteBranch.mockResolvedValueOnce(managementSnapshot);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");

    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "本地分支管理…" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "从指定分支创建…" }));
    let dialog = screen.getByRole("dialog", { name: "从指定分支创建" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "起点分支" }), { target: { value: "refs/remotes/origin/release" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "新分支名称" }), { target: { value: "release/local" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建并切换" }));
    await waitFor(() => expect(api.createBranchFrom).toHaveBeenCalledWith("D:/work/project", "release/local", "refs/remotes/origin/release"));

    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "本地分支管理…" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名本地分支…" }));
    dialog = screen.getByRole("dialog", { name: "重命名本地分支" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "本地分支" }), { target: { value: "refs/heads/feature/old" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "新分支名称" }), { target: { value: "feature/new" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "重命名" }));
    await waitFor(() => expect(api.renameBranch).toHaveBeenCalledWith("D:/work/project", "refs/heads/feature/old", "feature/new"));

    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "本地分支管理…" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "安全删除本地分支…" }));
    dialog = screen.getByRole("dialog", { name: "安全删除本地分支" });
    expect(within(dialog).queryByRole("option", { name: /main/ })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "待删除分支" }), { target: { value: "refs/heads/feature/old" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认安全删除" }));
    await waitFor(() => expect(api.deleteBranch).toHaveBeenCalledWith("D:/work/project", "refs/heads/feature/old"));
  });

  it("confirms merge direction for local or remote refs and records conflicts as attention", async () => {
    const cleanSnapshot = {
      ...snapshot,
      changes: [],
      branches: [
        ...snapshot.branches,
        { refName: "refs/heads/feature/local", name: "feature/local", kind: "local", oid: "111111111111", current: false, upstream: null, upstreamRef: null },
        { refName: "refs/remotes/origin/release", name: "origin/release", kind: "remote", oid: "222222222222", current: false, upstream: null, upstreamRef: null },
      ],
    } satisfies GitSnapshot;
    const conflicted = {
      ...cleanSnapshot,
      mergeInProgress: true,
      changes: [{ path: "src/conflict.ts", originalPath: null, status: "!", staged: false, conflict: true }],
    } satisfies GitSnapshot;
    api.snapshot.mockResolvedValueOnce(cleanSnapshot);
    api.mergeBranch.mockResolvedValueOnce(conflicted);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");

    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "合并分支…" }));
    const dialog = screen.getByRole("dialog", { name: "合并分支" });
    const sourceGroup = within(dialog).getByRole("group", { name: "源分支" });
    const targetGroup = within(dialog).getByRole("group", { name: "目标分支" });
    expect(sourceGroup).toBeInTheDocument();
    expect(targetGroup).toHaveTextContent("当前main");
    expect(sourceGroup.querySelector(".git-merge-node-title")).toHaveTextContent("源分支");
    expect(targetGroup.querySelector(".git-merge-node-title")).toHaveTextContent("目标分支");
    const source = within(sourceGroup).getByRole("combobox", { name: "源分支" });
    expect(within(targetGroup).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(targetGroup).getByLabelText("目标分支 main")).toHaveTextContent("main");
    expect(within(source).queryByRole("option", { name: /main/ })).not.toBeInTheDocument();
    fireEvent.change(source, { target: { value: "refs/remotes/origin/release" } });
    expect(sourceGroup).toHaveTextContent("远程");
    expect(within(dialog).getByLabelText("origin/release → main")).toBeInTheDocument();
    expect(within(dialog).getByText("使用 Git 默认策略合并；不会自动 Fetch 或 Stash。")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "取消合并" })).toBeInTheDocument();
    const requestMerge = within(dialog).getByRole("button", { name: "合并到 main" });
    requestMerge.focus();
    fireEvent.click(requestMerge);
    let confirmation = screen.getByRole("dialog", { name: "确认合并分支？" });
    expect(confirmation.closest(".dialog-scrim")).toHaveClass("git-merge-confirmation-scrim");
    expect(dialog).toHaveAttribute("inert");
    expect(dialog).toHaveAttribute("aria-hidden", "true");
    expect(confirmation).toHaveTextContent("origin/release → main");
    expect(within(confirmation).getByRole("button", { name: "返回" })).toHaveFocus();
    expect(api.mergeBranch).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "确认合并分支？" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "合并分支" })).not.toHaveAttribute("inert");
    expect(requestMerge).toHaveFocus();

    fireEvent.click(requestMerge);
    confirmation = screen.getByRole("dialog", { name: "确认合并分支？" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "确认合并" }));
    await waitFor(() => expect(api.mergeBranch).toHaveBeenCalledWith("D:/work/project", "refs/remotes/origin/release"));

    expect(await screen.findByText("合并未完成")).toBeInTheDocument();
    expect(screen.getByText("1 个冲突等待解决")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续合并" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    expect(screen.getByRole("menuitem", { name: "拉取" })).toBeDisabled();
    fireEvent.click(screen.getByRole("menuitem", { name: "操作记录" }));
    expect(within(screen.getByRole("dialog", { name: "Git 操作记录" })).getByLabelText("需要处理")).toBeInTheDocument();
  });

  it("requires a clean worktree before merge and explains the disabled confirmation", async () => {
    const dirtySnapshot = {
      ...snapshot,
      branches: [
        ...snapshot.branches,
        { refName: "refs/heads/feature/dirty", name: "feature/dirty", kind: "local", oid: "111111111111", current: false, upstream: null, upstreamRef: null },
      ],
    } satisfies GitSnapshot;
    api.snapshot.mockResolvedValueOnce(dirtySnapshot);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "合并分支…" }));
    const dialog = screen.getByRole("dialog", { name: "合并分支" });
    expect(within(dialog).getByText("开始合并前请先提交或清理工作区更改。")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "合并到 main" })).toBeDisabled();
    expect(api.mergeBranch).not.toHaveBeenCalled();
  });

  it("continues a resolved merge and confirms abort while restoring focus", async () => {
    const conflicted = {
      ...snapshot,
      mergeInProgress: true,
      changes: [{ path: "src/conflict.ts", originalPath: null, status: "!", staged: false, conflict: true }],
    } satisfies GitSnapshot;
    const resolved = {
      ...conflicted,
      changes: [{ path: "src/conflict.ts", originalPath: null, status: "M", staged: true, conflict: false }],
    } satisfies GitSnapshot;
    const completed = { ...snapshot, changes: [], mergeInProgress: false } satisfies GitSnapshot;
    api.snapshot.mockResolvedValueOnce(conflicted);
    api.stage.mockResolvedValueOnce(resolved);
    api.continueMerge.mockResolvedValueOnce(completed);
    const view = render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("合并未完成");
    fireEvent.click(screen.getByRole("button", { name: "暂存已解决文件 src/conflict.ts" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "继续合并" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "继续合并" }));
    await waitFor(() => expect(api.continueMerge).toHaveBeenCalledWith("D:/work/project"));
    expect(screen.queryByText("合并未完成")).not.toBeInTheDocument();

    view.unmount();
    api.snapshot.mockResolvedValueOnce(conflicted);
    api.abortMerge.mockResolvedValueOnce(completed);
    render(<GitPane blockId="git-2" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("合并未完成");
    const abort = screen.getByRole("button", { name: "中止合并" });
    fireEvent.click(abort);
    const confirmation = screen.getByRole("dialog", { name: "中止合并" });
    expect(within(confirmation).getByText(/可能放弃已经完成的冲突解决编辑/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "中止合并" })).not.toBeInTheDocument();
    await waitFor(() => expect(abort).toHaveFocus());
    fireEvent.click(abort);
    fireEvent.click(within(screen.getByRole("dialog", { name: "中止合并" })).getByRole("button", { name: "确认中止" }));
    await waitFor(() => expect(api.abortMerge).toHaveBeenCalledWith("D:/work/project"));
  });

  it("records sync partial success without losing the pulled snapshot", async () => {
    const pulled = { ...snapshot, repositoryName: "pulled-project", head: { ...snapshot.head, behind: 0 } };
    api.pull.mockResolvedValueOnce(pulled);
    api.push.mockRejectedValueOnce({ code: "gitCommandFailed", message: "https://alice:p%40ss@example.com/repo denied" });
    api.snapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(pulled);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "同步" }));
    expect(await screen.findByText("pulled-project")).toBeInTheDocument();
    await waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "操作记录" }));
    const log = screen.getByRole("dialog", { name: "Git 操作记录" });
    expect(within(log).getByText("同步")).toBeInTheDocument();
    expect(within(log).getByText(/Pull 已完成.*Push 失败/)).toBeInTheDocument();
    expect(log).not.toHaveTextContent("alice");
    expect(log).not.toHaveTextContent("p%40ss");
    expect(log).toHaveTextContent("https://***@example.com/repo denied");
  });

  it("shows running and duration states and bounds the in-memory operation log to 20 records", async () => {
    const pendingPush = deferred<GitSnapshot>();
    api.push.mockReturnValueOnce(pendingPush.promise);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");

    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "推送" }));
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "操作记录" }));
    expect(within(screen.getByRole("dialog", { name: "Git 操作记录" })).getByLabelText("进行中")).toBeInTheDocument();
    pendingPush.resolve(snapshot);
    await waitFor(() => expect(within(screen.getByRole("dialog", { name: "Git 操作记录" })).getByLabelText("成功")).toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Git 操作记录" })).toHaveTextContent(/\d+ ms/);
    fireEvent.keyDown(document, { key: "Escape" });

    for (let index = 0; index < 20; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "推送" }));
      await waitFor(() => expect(api.push).toHaveBeenCalledTimes(index + 2));
    }
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "操作记录" }));
    expect(within(screen.getByRole("dialog", { name: "Git 操作记录" })).getAllByRole("listitem")).toHaveLength(20);
  });

  it("grows the commit message from one row to a five-row cap and keeps the action below it", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("src/staged.ts");
    const message = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "提交消息" });
    const submit = screen.getByRole("button", { name: "提交" });
    expect(message.rows).toBe(1);
    expect(message).toHaveAttribute("data-max-rows", "5");
    expect(message.parentElement).toHaveClass("git-commit-box");
    expect(submit).toHaveClass("git-commit-button");
    expect(submit).toHaveTextContent("提交");
    expect(submit.querySelector("kbd")).toBeNull();
    expect(message.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    Object.defineProperty(message, "scrollHeight", { configurable: true, value: 200 });
    fireEvent.change(message, { target: { value: "one\ntwo\nthree\nfour\nfive\nsix" } });
    expect(Number.parseFloat(message.style.height)).toBeLessThanOrEqual(92);
    expect(message.style.overflowY).toBe("auto");
  });

  it("does not submit with Ctrl+Enter", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("src/staged.ts");
    const message = screen.getByRole("textbox", { name: "提交消息" });
    fireEvent.change(message, { target: { value: "feat: keyboard commit" } });
    fireEvent.keyDown(message, { key: "Enter", ctrlKey: true });
    expect(api.commit).not.toHaveBeenCalled();
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
    const onRepositoryOpened = vi.fn();
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()} onRepositoryOpened={onRepositoryOpened}/>);
    fireEvent.click(await screen.findByRole("button", { name: "初始化存储库" }));
    await waitFor(() => expect(api.initialize).toHaveBeenCalledWith("D:/work/project"));
    expect(await screen.findByText("project")).toBeInTheDocument();
    expect(onRepositoryOpened).toHaveBeenCalledOnce();
    expect(onRepositoryOpened).toHaveBeenCalledWith({ type: "local", path: "D:/work/project" });
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
    const remoteSnapshot = {
      ...snapshot,
      repositoryPath: "/srv/project",
      branches: [
        ...snapshot.branches,
        { refName: "refs/remotes/origin/feature/remote", name: "origin/feature/remote", kind: "remote" as const, oid: "123456789abc", current: false, upstream: null, upstreamRef: null },
      ],
    };
    const onRepositoryOpened = vi.fn();
    api.remote.mockResolvedValue(remoteSnapshot);
    render(<GitPane
      blockId="git-remote"
      target={{ type: "remote", profileId: "profile-1", path: "/srv/project" }}
      runtime={{ sessionId: "git-session", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null, stale: false }}
      visible
      onTargetChange={vi.fn()}
      onRepositoryOpened={onRepositoryOpened}
    />);
    await waitFor(() => expect(api.remote).toHaveBeenCalledWith("git-session", "profile-1", { type: "snapshot", path: "/srv/project" }));
    fireEvent.click(await screen.findByRole("button", { name: "刷新 Git 状态" }));
    await waitFor(() => expect(api.remote).toHaveBeenCalledWith("git-session", "profile-1", { type: "fetch", repository: "/srv/project" }));
    fireEvent.click(screen.getByRole("button", { name: "切换分支，当前 main" }));
    fireEvent.click(screen.getByRole("option", { name: /origin\/feature\/remote/ }));
    await waitFor(() => expect(api.remote).toHaveBeenCalledWith("git-session", "profile-1", { type: "trackRemoteBranch", repository: "/srv/project", refName: "refs/remotes/origin/feature/remote" }));
    fireEvent.click(await screen.findByRole("button", { name: "暂存 src/new.ts" }));
    await waitFor(() => expect(api.remote).toHaveBeenCalledWith("git-session", "profile-1", { type: "stage", repository: "/srv/project", paths: ["src/new.ts"] }));
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    fireEvent.click(screen.getByRole("button", { name: /feat: initial/ }));
    await waitFor(() => expect(api.remoteCommitFiles).toHaveBeenCalledWith("git-session", "profile-1", "/srv/project", "abcdef012345"));
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "拉取" }));
    await waitFor(() => expect(api.remote).toHaveBeenCalledWith("git-session", "profile-1", { type: "pull", repository: "/srv/project" }));
    expect(api.snapshot).not.toHaveBeenCalled();
    expect(onRepositoryOpened).toHaveBeenCalledOnce();
    expect(onRepositoryOpened).toHaveBeenCalledWith({ type: "remote", profileId: "profile-1", path: "/srv/project" });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
