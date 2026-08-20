import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../lib/tauri/network", () => ({
  listNetworkRules: mocks.list,
  createNetworkRule: mocks.create,
  updateNetworkRule: mocks.update,
  deleteNetworkRule: mocks.remove,
}));

import { NetworkPane } from "./NetworkPane";

const localRule = {
  id: "rule-1",
  profileId: "profile-1",
  name: "Web tunnel",
  type: "local" as const,
  bindHost: "127.0.0.1",
  bindPort: 8080,
  targetHost: "localhost",
  targetPort: 80,
  exposed: false,
};

describe("NetworkPane", () => {
  beforeEach(() => {
    Reflect.set(window, "__TAURI_INTERNALS__", {});
    mocks.list.mockReset().mockResolvedValue([localRule]);
    mocks.create.mockReset().mockResolvedValue(undefined);
    mocks.update.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("lists profile-scoped rules and delegates block-local start state", async () => {
    const onStart = vi.fn();
    render(<NetworkPane profileId="profile-1" onStart={onStart}/>);
    expect(await screen.findByText("Web tunnel")).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith("profile-1");
    await userEvent.click(screen.getByRole("button", { name: "启动" }));
    expect(onStart).toHaveBeenCalledWith(localRule);
  });

  it("locks mutation controls while running and deletes only after confirmation", async () => {
    const user = userEvent.setup();
    const view = render(<NetworkPane profileId="profile-1" runtimeStates={{ "rule-1": "running" }} onStop={vi.fn()}/>);
    await screen.findByText("Web tunnel");
    expect(screen.getByRole("button", { name: "编辑 Web tunnel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除 Web tunnel" })).toBeDisabled();
    view.rerender(<NetworkPane profileId="profile-1" runtimeStates={{ "rule-1": "stopped" }} onStart={vi.fn()}/>);
    await user.click(screen.getByRole("button", { name: "删除 Web tunnel" }));
    expect(screen.getByText("将删除“Web tunnel”。此操作无法撤销，但不会删除连接配置。")).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "删除规则" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("rule-1"));
    await waitFor(() => expect(mocks.list.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("protects a shared rule that is active in another Network block", async () => {
    render(<NetworkPane profileId="profile-1" runtimeStates={{ "rule-1": "stopped" }} lockedRuleIds={new Set(["rule-1"])} onStart={vi.fn()}/>);
    await screen.findByText("Web tunnel");
    expect(screen.getByRole("button", { name: "编辑 Web tunnel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑 Web tunnel" })).toHaveAttribute("title", "该规则正在其他网络窗口运行");
  });
});
