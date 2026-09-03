import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GitSnapshot } from "../lib/tauri/git";
import { api, setupGitPaneTests, snapshot } from "./GitPane.testHarness";
import { GitPane } from "./GitPane";

setupGitPaneTests();

const submoduleSnapshot: GitSnapshot = {
  ...snapshot,
  changes: [
    {
      path: "modules/dirty",
      originalPath: null,
      status: "M",
      staged: false,
      conflict: false,
      submodule: { commitChanged: false, trackedModified: true, untrackedContent: false },
    },
  ],
  submodules: [
    {
      name: "ready",
      path: "modules/ready",
      recordedOid: "1111111111111111111111111111111111111111",
      currentOid: "2222222222222222222222222222222222222222",
      initialized: true,
      commitChanged: true,
      trackedModified: false,
      untrackedContent: false,
      conflict: false,
      issue: null,
    },
    {
      name: "missing",
      path: "modules/missing",
      recordedOid: "3333333333333333333333333333333333333333",
      currentOid: null,
      initialized: false,
      commitChanged: false,
      trackedModified: false,
      untrackedContent: false,
      conflict: false,
      issue: null,
    },
  ],
};

describe("GitPane submodules", () => {
  it("merges submodules into the repository tree without retargeting the workspace", async () => {
    const childSnapshot: GitSnapshot = {
      ...snapshot,
      repositoryPath: "D:/work/project/modules/ready",
      repositoryName: "ready",
      submodules: [{
        name: "grandchild",
        path: "deps/grandchild",
        recordedOid: "4".repeat(40),
        currentOid: "4".repeat(40),
        initialized: true,
        commitChanged: false,
        trackedModified: false,
        untrackedContent: false,
        conflict: false,
        issue: null,
      }],
      changes: [{ path: "child.ts", originalPath: null, status: "M", staged: false, conflict: false }],
    };
    api.snapshot.mockImplementation((path: string) => Promise.resolve(path.endsWith("modules/ready") ? childSnapshot : submoduleSnapshot));
    api.initializeSubmodule.mockResolvedValue(submoduleSnapshot);
    api.checkoutSubmodule.mockResolvedValue(submoduleSnapshot);
    api.stage.mockResolvedValue({ ...childSnapshot, changes: [{ ...childSnapshot.changes[0], staged: true }] });
    const onTargetChange = vi.fn();
    const onRepositoryOpened = vi.fn();
    render(<GitPane blockId="git-submodules" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={onTargetChange} onRepositoryOpened={onRepositoryOpened}/>);

    expect(await screen.findByRole("tree", { name: "Git 存储库" })).toBeInTheDocument();
    expect(screen.queryByText("子仓库 2")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换到 ready，记录版本已变化" })).toBeInTheDocument();
    expect(screen.getByText("未初始化")).toBeInTheDocument();
    const childBranch = await screen.findByRole("button", { name: "切换 ready 分支，当前 main" });
    expect(screen.getByRole("button", { name: "当前存储库 project，父仓库" })).toBeInTheDocument();
    const childChanges = screen.getByRole("button", { name: "查看 ready 的 1 项更改" });
    expect(childChanges.closest(".git-repository-status-group")?.querySelector(".git-repository-sync")).toHaveAttribute("aria-label", "领先 1 个提交，落后 0 个提交");

    fireEvent.click(screen.getByRole("button", { name: "初始化 modules/missing" }));
    await waitFor(() => expect(api.initializeSubmodule).toHaveBeenCalledWith("D:/work/project", "modules/missing"));

    expect(screen.queryByRole("button", { name: "检出记录版本 modules/ready" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "切换到 ready，记录版本已变化" }));
    expect(await screen.findByRole("button", { name: "当前存储库 ready，记录版本已变化" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Git 仓库操作" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "检出记录版本" }));
    await waitFor(() => expect(api.checkoutSubmodule).toHaveBeenCalledWith("D:/work/project", "modules/ready"));

    await waitFor(() => expect(api.snapshot).toHaveBeenCalledWith("D:/work/project/modules/ready"));
    expect(screen.queryByRole("button", { name: "切换到 grandchild，干净" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开 ready" }));
    expect(screen.getByRole("button", { name: "切换到 grandchild，干净" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "暂存 child.ts" }));
    await waitFor(() => expect(api.stage).toHaveBeenCalledWith("D:/work/project/modules/ready", ["child.ts"]));

    fireEvent.click(screen.getByRole("button", { name: "切换到 project，父仓库" }));
    expect(await screen.findByRole("button", { name: "当前存储库 project，父仓库" })).toBeInTheDocument();
    fireEvent.click(childBranch);
    expect(await screen.findByRole("dialog", { name: "切换分支" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "当前存储库 ready，记录版本已变化" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(childBranch).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "切换到 project，父仓库" }));
    expect(await screen.findByRole("button", { name: "当前存储库 project，父仓库" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新 ready Git 状态" }));
    await waitFor(() => expect(api.fetch).toHaveBeenCalledWith("D:/work/project/modules/ready"));
    expect(onTargetChange).not.toHaveBeenCalled();
    expect(onRepositoryOpened).toHaveBeenCalledTimes(1);
    expect(onRepositoryOpened).toHaveBeenCalledWith({ type: "local", path: "D:/work/project" });
  });

  it("prevents dirty-only submodules from being staged or discarded in the parent", async () => {
    api.snapshot.mockResolvedValue(submoduleSnapshot);
    render(<GitPane blockId="git-dirty-submodule" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);

    const stage = await screen.findByRole("button", { name: "暂存 modules/dirty" });
    expect(stage).toBeDisabled();
    expect(screen.getByRole("button", { name: "暂存全部更改" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "请打开子仓库处理内部修改" })).toBeDisabled();
    fireEvent.contextMenu(screen.getByText("modules/dirty").closest(".git-change-row")!);
    expect(screen.getByRole("menuitem", { name: "添加到暂存区" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "抛弃更改" })).toBeDisabled();
  });

  it("re-reads the owning repository after a submodule lifecycle failure", async () => {
    api.snapshot.mockResolvedValue(submoduleSnapshot);
    api.initializeSubmodule.mockRejectedValue({ code: "commandFailed", message: "初始化失败" });
    render(<GitPane blockId="git-submodule-recovery" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);

    fireEvent.click(await screen.findByRole("button", { name: "初始化 modules/missing" }));
    await waitFor(() => expect(api.initializeSubmodule).toHaveBeenCalledWith("D:/work/project", "modules/missing"));
    await waitFor(() => expect(api.snapshot.mock.calls.filter(([path]) => path === "D:/work/project").length).toBeGreaterThan(1));
    expect(screen.getByText("初始化失败")).toBeInTheDocument();
  });

  it("uses the same scoped action over a connected SSH Git session", async () => {
    const remoteSnapshot = { ...submoduleSnapshot, repositoryPath: "/srv/project" };
    api.remote.mockImplementation((_sessionId: string, _profileId: string, action: { type: string }) => {
      if (action.type === "snapshot" || action.type === "initializeSubmodule") return Promise.resolve(remoteSnapshot);
      return Promise.reject(new Error(`unexpected action ${action.type}`));
    });
    render(<GitPane
      blockId="git-remote-submodules"
      target={{ type: "remote", profileId: "profile-1", path: "/srv/project" }}
      runtime={{ sessionId: "git-session", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null, stale: false }}
      visible
      onTargetChange={vi.fn()}
    />);

    fireEvent.click(await screen.findByRole("button", { name: "初始化 modules/missing" }));
    await waitFor(() => expect(api.remote).toHaveBeenCalledWith(
      "git-session",
      "profile-1",
      { type: "initializeSubmodule", repository: "/srv/project", path: "modules/missing" },
    ));
  });

  it("switches remote repository nodes inside the connected Git session", async () => {
    const remoteRoot = { ...submoduleSnapshot, repositoryPath: "/srv/project" };
    const remoteChild = { ...snapshot, repositoryPath: "/srv/project/modules/ready", repositoryName: "ready", changes: [], submodules: [] };
    api.remote.mockImplementation((_sessionId: string, _profileId: string, action: { type: string; path?: string }) => {
      if (action.type === "snapshot") return Promise.resolve(action.path?.endsWith("modules/ready") ? remoteChild : remoteRoot);
      return Promise.reject(new Error(`unexpected action ${action.type}`));
    });
    const onTargetChange = vi.fn();
    render(<GitPane
      blockId="git-remote-tree"
      target={{ type: "remote", profileId: "profile-1", path: "/srv/project" }}
      runtime={{ sessionId: "git-session", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null, stale: false }}
      visible
      onTargetChange={onTargetChange}
    />);

    fireEvent.click(await screen.findByRole("button", { name: "切换到 ready，记录版本已变化" }));
    await waitFor(() => expect(api.remote).toHaveBeenCalledWith(
      "git-session",
      "profile-1",
      { type: "snapshot", path: "/srv/project/modules/ready" },
    ));
    expect(await screen.findByRole("button", { name: "当前存储库 ready，记录版本已变化" })).toBeInTheDocument();
    expect(onTargetChange).not.toHaveBeenCalled();
  });
});
