import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GitSnapshot } from "../lib/tauri/git";
import { api, deferred, setupGitPaneTests, snapshot } from "./GitPane.testHarness";
import { GitPane } from "./GitPane";

setupGitPaneTests();

describe("GitPane basics and lifecycle", () => {
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
    expect(Array.from(document.querySelectorAll(".git-change-status")).map((node) => node.textContent)).toEqual(["修改", "未跟踪"]);
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

  it("does not refresh the snapshot when only the target-change callback changes", async () => {
    vi.useFakeTimers();
    try {
      const view = render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(api.snapshot).toHaveBeenCalledTimes(1);

      view.rerender(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
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
      if (section.classList.contains("git-submodules-section")) return "submodules";
      if (section.classList.contains("git-changes-section")) return "changes";
      return "graph";
    });
    expect(repository).toHaveAttribute("aria-expanded", "true");
    expect(changes).toHaveAttribute("aria-expanded", "true");
    expect(graph).toHaveAttribute("aria-expanded", "false");
    expect(sectionOrder()).toEqual(["repository", "submodules", "changes", "graph"]);
    expect(graph.closest("section")).toHaveClass("git-graph-section", "collapsed");
    expect(graph.closest("section")?.querySelector(".git-section-body")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(graph);
    expect(graph).toHaveAttribute("aria-expanded", "true");
    expect(changes).toHaveAttribute("aria-expanded", "false");
    expect(changes.closest("section")).toHaveClass("git-changes-section", "collapsed");
    expect(graph.closest("section")).not.toHaveClass("collapsed");
    expect(sectionOrder()).toEqual(["repository", "submodules", "changes", "graph"]);

    fireEvent.click(changes);
    expect(changes).toHaveAttribute("aria-expanded", "true");
    expect(graph).toHaveAttribute("aria-expanded", "false");
    expect(changes.closest("section")).not.toHaveClass("collapsed");
    expect(graph.closest("section")).toHaveClass("git-graph-section", "collapsed");
    expect(sectionOrder()).toEqual(["repository", "submodules", "changes", "graph"]);
  });

  it("shows the repository path beside the section title without repeating it in the content", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    const path = screen.getByTitle("D:/work/project");
    expect(path).toHaveClass("git-section-meta");
    expect(path.closest("header")).toHaveClass("git-section-header");
    expect(document.querySelector(".git-path")).not.toBeInTheDocument();
  });

  it("grows the commit message from one row to a five-row cap and keeps the action below it", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("src/staged.ts");
    const message = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "提交消息" });
    const submit = screen.getByRole("button", { name: "提交 1 项已暂存更改" });
    expect(message.rows).toBe(1);
    expect(message).toHaveAttribute("data-max-rows", "5");
    expect(message.parentElement).toHaveClass("git-commit-box");
    expect(submit).toHaveClass("git-primary-action");
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
    fireEvent.click(screen.getByRole("button", { name: "提交 1 项已暂存更改" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("缺少 user.email");
    expect(message).toHaveValue("feat: keep me");
    fireEvent.click(screen.getByRole("button", { name: "提交 1 项已暂存更改" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "提交消息" })).not.toBeInTheDocument());
  });

  it("uses the aggregate button for stage-all without chaining into commit", async () => {
    const onlyUnstaged = {
      ...snapshot,
      changes: [{ path: "src/new.ts", originalPath: null, status: "U", staged: false, conflict: false }],
    } satisfies GitSnapshot;
    api.snapshot.mockResolvedValueOnce(onlyUnstaged);
    api.stageAll.mockResolvedValueOnce({ ...onlyUnstaged, changes: [{ ...onlyUnstaged.changes[0], staged: true }] });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");

    fireEvent.click(screen.getByRole("button", { name: "全部暂存 1 项更改" }));
    await waitFor(() => expect(api.stageAll).toHaveBeenCalledWith("D:/work/project"));
    expect(api.commit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "提交 1 项已暂存更改" })).toBeDisabled();
  });

  it("keeps partial commit primary and exposes stage-rest through an accessible split menu", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    const toggle = screen.getByRole("button", { name: "更多提交操作" });
    toggle.focus();
    fireEvent.keyDown(toggle, { key: "ArrowDown" });
    const menu = screen.getByRole("menu", { name: "其他提交操作" });
    const stageRest = within(menu).getByRole("menuitem", { name: "暂存其余 1 项更改" });
    expect(stageRest).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(toggle).toHaveFocus());

    fireEvent.click(toggle);
    expect(screen.getByRole("menu", { name: "其他提交操作" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "其他提交操作" })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    fireEvent.resize(window);
    expect(screen.queryByRole("menu", { name: "其他提交操作" })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("menuitem", { name: "暂存其余 1 项更改" }));
    await waitFor(() => expect(api.stageAll).toHaveBeenCalledWith("D:/work/project"));
    expect(api.commit).not.toHaveBeenCalled();
  });

  it("turns a successful commit into push without automatically pushing", async () => {
    const committed = { ...snapshot, changes: [], head: { ...snapshot.head, ahead: 2 } } satisfies GitSnapshot;
    api.commit.mockResolvedValueOnce(committed);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.change(screen.getByRole("textbox", { name: "提交消息" }), { target: { value: "feat: aggregate action" } });
    fireEvent.click(screen.getByRole("button", { name: "提交 1 项已暂存更改" }));

    await waitFor(() => expect(api.commit).toHaveBeenCalledWith("D:/work/project", "feat: aggregate action"));
    expect(api.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "提交消息" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "推送 2 个提交" })).toBeEnabled();
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

  it("keeps the new target snapshot when the previous target refresh finishes late", async () => {
    const first = deferred<GitSnapshot>();
    const second = deferred<GitSnapshot>();
    api.snapshot.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(1));
    view.rerender(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/other" }} visible onTargetChange={vi.fn()}/>);
    await waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(2));

    second.resolve({ ...snapshot, repositoryPath: "D:/work/other", repositoryName: "newest-project" });
    expect(await screen.findByText("newest-project")).toBeInTheDocument();
    first.resolve({ ...snapshot, repositoryName: "stale-project" });
    await waitFor(() => expect(screen.queryByText("stale-project")).not.toBeInTheDocument());
    expect(screen.getByText("newest-project")).toBeInTheDocument();
  });
});
