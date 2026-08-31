import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GitSnapshot } from "../lib/tauri/git";
import { api, deferred, setupGitPaneTests, snapshot } from "./GitPane.testHarness";
import { GitPane } from "./GitPane";

setupGitPaneTests();

describe("GitPane merge, operations, and remote routing", () => {
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
