import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitPane } from "./GitPane";
import type { GitSnapshot } from "../lib/tauri/git";

const api = vi.hoisted(() => ({
  available: vi.fn(), select: vi.fn(), snapshot: vi.fn(), initialize: vi.fn(), stage: vi.fn(), stageAll: vi.fn(), unstage: vi.fn(), unstageAll: vi.fn(), commit: vi.fn(), commitFiles: vi.fn(), createBranch: vi.fn(), switchBranch: vi.fn(), remote: vi.fn(), remoteCommitFiles: vi.fn(),
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
  loadGitCommitFiles: api.commitFiles,
  createGitBranch: api.createBranch,
  switchGitBranch: api.switchBranch,
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
  branches: [{ name: "main", oid: "abcdef012345", current: true, upstream: "origin/main" }],
  commits: [{ oid: "abcdef012345", parents: [], decorations: ["HEAD -> main"], subject: "feat: initial", body: "Introduces the first Qterm workflow.\n\nKeeps the terminal interaction compact.", author: "Qterm", timestamp: 1_700_000_000 }],
};

describe("GitPane", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    api.available.mockResolvedValue(true);
    api.snapshot.mockResolvedValue(snapshot);
    api.createBranch.mockResolvedValue(snapshot);
    api.switchBranch.mockResolvedValue(snapshot);
    api.commitFiles.mockResolvedValue([
      { path: "src/new-file.ts", originalPath: null, status: "A" },
      { path: "src/renamed.ts", originalPath: "src/old.ts", status: "R100" },
    ]);
    api.remoteCommitFiles.mockResolvedValue([]);
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
    expect(Array.from(railSvg?.querySelectorAll("path") ?? []).some((path) => path.getAttribute("d")?.endsWith("36"))).toBe(true);
    expect(card).not.toContainElement(rail);
    expect(card).not.toContainElement(details);
    expect(details).toContainElement(files);
    expect(details?.querySelectorAll(".git-graph-continuation line")).toHaveLength(2);
    expect(entry?.querySelectorAll(":scope > .git-graph-bridge line")).toHaveLength(2);
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
      branches: [...snapshot.branches, { name: "feature/portal", oid: "123456789abc", current: false, upstream: null }],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    const repositoryName = await screen.findByText("project");
    const repositoryRow = repositoryName.closest(".git-repository-row");
    const branchTrigger = screen.getByRole("button", { name: "切换分支，当前 main" });
    expect(repositoryRow?.closest(".git-repository-card")).toBeInTheDocument();
    expect(repositoryRow).toContainElement(branchTrigger);
    expect(branchTrigger).toContainElement(branchTrigger.querySelector('[data-icon="git"]'));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(repositoryRow).toContainElement(screen.getByRole("button", { name: "创建分支" }));
    expect(repositoryRow).toContainElement(screen.getByRole("button", { name: "刷新 Git 状态" }));

    fireEvent.click(branchTrigger);
    const branchDialog = screen.getByRole("dialog", { name: "切换分支" });
    expect(branchDialog.parentElement).toBe(document.body);
    expect(screen.getByRole("searchbox", { name: "筛选分支" })).toHaveAttribute("placeholder", "筛选要签出的分支");
    expect(screen.getByRole("option", { name: /main/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.change(screen.getByRole("searchbox", { name: "筛选分支" }), { target: { value: "feature" } });
    expect(screen.queryByRole("option", { name: /main/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /feature\/portal/ }));
    await waitFor(() => expect(api.switchBranch).toHaveBeenCalledWith("D:/work/project", "feature/portal"));
    expect(screen.queryByRole("dialog", { name: "切换分支" })).not.toBeInTheDocument();
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

  it("portals and closes the repository more-actions menu so section overflow cannot clip it", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "更多存储库操作" }));
    const menu = screen.getByRole("menu", { name: "存储库操作" });
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getByRole("menuitem", { name: "更换本机仓库" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "存储库操作" })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    fireEvent.click(screen.getByRole("button", { name: /feat: initial/ }));
    await waitFor(() => expect(api.remoteCommitFiles).toHaveBeenCalledWith("git-session", "profile-1", "/srv/project", "abcdef012345"));
    expect(api.snapshot).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
