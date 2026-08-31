import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GitSnapshot } from "../lib/tauri/git";
import { api, deferred, setupGitPaneTests, snapshot } from "./GitPane.testHarness";
import { GitPane } from "./GitPane";

setupGitPaneTests();

describe("GitPane branches and repository actions", () => {
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
});
