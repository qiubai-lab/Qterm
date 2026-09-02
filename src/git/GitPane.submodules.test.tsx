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
  it("shows direct submodule state and runs only the scoped lifecycle actions", async () => {
    api.snapshot.mockResolvedValue(submoduleSnapshot);
    api.initializeSubmodule.mockResolvedValue(submoduleSnapshot);
    api.checkoutSubmodule.mockResolvedValue(submoduleSnapshot);
    const onTargetChange = vi.fn();
    render(<GitPane blockId="git-submodules" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={onTargetChange}/>);

    expect(await screen.findByRole("list", { name: "Git 子仓库" })).toBeInTheDocument();
    expect(screen.getByText("记录版本已变化")).toBeInTheDocument();
    expect(screen.getByText("未初始化")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "初始化 modules/missing" }));
    await waitFor(() => expect(api.initializeSubmodule).toHaveBeenCalledWith("D:/work/project", "modules/missing"));

    fireEvent.click(screen.getByRole("button", { name: "检出记录版本 modules/ready" }));
    await waitFor(() => expect(api.checkoutSubmodule).toHaveBeenCalledWith("D:/work/project", "modules/ready"));

    fireEvent.click(screen.getByRole("button", { name: "打开 modules/ready" }));
    expect(onTargetChange).toHaveBeenCalledWith({ type: "local", path: "D:/work/project/modules/ready" });
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
});
