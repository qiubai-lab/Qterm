import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const view = render(<NetworkPane profileId="profile-1" onStart={onStart}/>);
    expect(await screen.findByText("Web tunnel")).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith("profile-1");
    expect(screen.getByRole("button", { name: "创建网络实例" })).toHaveTextContent(/^$/);
    expect(screen.queryByText("创建实例")).not.toBeInTheDocument();
    expect(screen.queryByText("已停止")).not.toBeInTheDocument();
    expect(view.container.querySelector(".network-rule-menu-hint")).not.toBeInTheDocument();
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(screen.getByText("OFF")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "启动 Web tunnel" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(onStart).toHaveBeenCalledWith(localRule);
    view.rerender(<NetworkPane profileId="profile-1" runtimeStates={{ "rule-1": "starting" }} onStart={onStart} onStop={vi.fn()}/>);
    expect(screen.getByRole("switch", { name: "正在启动 Web tunnel" })).toBeDisabled();
  });

  it("marks the remaining list area as an empty-state centering surface", async () => {
    mocks.list.mockResolvedValue([]);
    const view = render(<NetworkPane profileId="profile-1" onStart={vi.fn()}/>);

    expect(await screen.findByText("暂无网络实例")).toBeInTheDocument();
    expect(view.container.querySelector(".network-rule-list")).toHaveClass("empty");
  });

  it("shows explicit local and remote endpoint roles with matching device icons", async () => {
    mocks.list.mockResolvedValue([
      localRule,
      { ...localRule, id: "rule-2", name: "Remote app", type: "remote", bindHost: "0.0.0.0", bindPort: 9000, targetHost: "localhost", targetPort: 3000, exposed: true },
      { id: "rule-3", profileId: "profile-1", name: "Private proxy", type: "socks5", bindHost: "127.0.0.1", bindPort: 1080, exposed: false },
    ]);
    render(<NetworkPane profileId="profile-1" onStart={vi.fn()}/>);

    const localRoute = await screen.findByLabelText("本地 127.0.0.1:8080 → 远程 localhost:80");
    expect(localRoute.querySelector('[data-icon="computer"]')).toBeInTheDocument();
    expect(localRoute.querySelector('[data-icon="server"]')).toBeInTheDocument();
    expect(localRoute.querySelector('.network-rule-route-highlight[aria-hidden="true"]')).toBeInTheDocument();

    const remoteRoute = screen.getByLabelText("远程 0.0.0.0:9000 → 本地 localhost:3000");
    expect(remoteRoute.querySelector('[data-icon="server"]')).toBeInTheDocument();
    expect(remoteRoute.querySelector('[data-icon="computer"]')).toBeInTheDocument();

    const socksRoute = screen.getByLabelText("本地 127.0.0.1:1080 → 远程网络 动态目标");
    expect(socksRoute.querySelector('[data-icon="computer"]')).toBeInTheDocument();
    expect(socksRoute.querySelector('[data-icon="server"]')).toBeInTheDocument();
  });

  it("explains all three modes before opening the selected creation form", async () => {
    const user = userEvent.setup();
    render(<NetworkPane profileId="profile-1" onStart={vi.fn()}/>);
    await screen.findByText("Web tunnel");

    await user.click(screen.getByRole("button", { name: "创建网络实例" }));
    expect(screen.getByRole("dialog", { name: "选择网络模式" })).toBeInTheDocument();
    expect(screen.getByText("在本地启动 SOCKS5 代理。浏览器或应用连接后，会通过服务器访问网站或内网服务。")).toBeInTheDocument();
    expect(screen.getByText("在本地开放端口。连接后，流量会通过服务器转发到服务器能够访问的目标服务。")).toBeInTheDocument();
    expect(screen.getByText("在服务器开放端口。连接后，流量会通过 SSH 转发到本地能够访问的目标服务。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /SOCKS5 动态代理/ }));
    expect(screen.getByRole("dialog", { name: "创建网络规则" })).toBeInTheDocument();
    expect(screen.getByText("SOCKS5 动态代理", { selector: ".network-selected-type strong" })).toBeInTheDocument();
    expect(screen.getByLabelText("监听端口")).toHaveValue(1080);
    expect(screen.queryByLabelText("目标地址")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回选择" }));
    expect(screen.getByRole("dialog", { name: "选择网络模式" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /本地端口转发/ }));
    expect(screen.getByLabelText("目标地址")).toHaveValue("localhost");
  });

  it("returns from a new-rule form to mode selection when closed or dismissed with Escape", async () => {
    const user = userEvent.setup();
    render(<NetworkPane profileId="profile-1" onStart={vi.fn()}/>);
    await screen.findByText("Web tunnel");

    await user.click(screen.getByRole("button", { name: "创建网络实例" }));
    await user.click(screen.getByRole("button", { name: /本地端口转发/ }));
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("dialog", { name: "选择网络模式" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /远程端口转发/ }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "选择网络模式" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("finishes the creation flow after saving instead of returning to mode selection", async () => {
    const user = userEvent.setup();
    render(<NetworkPane profileId="profile-1" onStart={vi.fn()}/>);
    await screen.findByText("Web tunnel");

    await user.click(screen.getByRole("button", { name: "创建网络实例" }));
    await user.click(screen.getByRole("button", { name: /本地端口转发/ }));
    await user.type(screen.getByLabelText("名称"), "Saved tunnel");
    await user.click(screen.getByRole("button", { name: "保存规则" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      type: "local",
      profileId: "profile-1",
      name: "Saved tunnel",
      bindHost: "127.0.0.1",
      bindPort: 8080,
      targetHost: "localhost",
      targetPort: 80,
    }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens existing rules directly in the fixed-type editor", async () => {
    const user = userEvent.setup();
    render(<NetworkPane profileId="profile-1" runtimeStates={{ "rule-1": "stopped" }} onStart={vi.fn()}/>);
    await screen.findByText("Web tunnel");
    fireEvent.contextMenu(screen.getByRole("listitem", { name: "Web tunnel，已停止" }), { clientX: 80, clientY: 60 });

    await user.click(screen.getByRole("menuitem", { name: "编辑规则" }));
    expect(screen.queryByRole("dialog", { name: "选择网络模式" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "编辑网络规则" })).toBeInTheDocument();
    expect(screen.getByText("本地端口转发", { selector: ".network-selected-type strong" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回选择" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps edit and delete in the context menu, locks them while running, and confirms deletion", async () => {
    const user = userEvent.setup();
    const view = render(<NetworkPane profileId="profile-1" runtimeStates={{ "rule-1": "running" }} onStop={vi.fn()}/>);
    await screen.findByText("Web tunnel");
    expect(screen.queryByRole("menuitem", { name: "编辑规则" })).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole("listitem", { name: "Web tunnel，运行中" }), { clientX: 80, clientY: 60 });
    expect(screen.getByRole("menuitem", { name: "编辑规则" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "删除规则" })).toBeDisabled();
    view.rerender(<NetworkPane profileId="profile-1" runtimeStates={{ "rule-1": "stopped" }} onStart={vi.fn()}/>);
    await user.click(screen.getByRole("menuitem", { name: "删除规则" }));
    expect(screen.getByText("将删除“Web tunnel”。此操作无法撤销，但不会删除连接配置。")).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "删除规则" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("rule-1"));
    await waitFor(() => expect(mocks.list.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("protects a shared rule that is active in another Network block", async () => {
    render(<NetworkPane profileId="profile-1" runtimeStates={{ "rule-1": "stopped" }} lockedRuleIds={new Set(["rule-1"])} onStart={vi.fn()}/>);
    await screen.findByText("Web tunnel");
    fireEvent.contextMenu(screen.getByRole("listitem", { name: "Web tunnel，已停止" }), { clientX: 80, clientY: 60 });
    expect(screen.getByRole("menuitem", { name: "编辑规则" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "编辑规则" })).toHaveAttribute("title", "该规则正在其他网络窗口运行");
  });
});
