import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TerminalTargetPicker } from "./TerminalTargetPicker";

const profiles = [
  { id: "profile-1", name: "Production", host: "prod.example", port: 22, username: "deploy", authPreference: "password" as const, credentialId: null, groupId: "group-1" },
  { id: "profile-2", name: "Bastion", host: "jump.example", port: 2222, username: "ops", authPreference: "privateKey" as const, credentialId: null, groupId: "group-1" },
  { id: "profile-3", name: "Personal", host: "home.example", port: 22, username: "qiubai", authPreference: "sshAgent" as const, credentialId: null, groupId: null },
];
const groups = [{ id: "group-1", name: "生产环境" }];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TerminalTargetPicker", () => {
  it("lists the local shell and saved connection profiles from the terminal name", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TerminalTargetPicker profiles={profiles} groups={groups} recentProfileIds={["profile-2", "profile-1"]} selectedProfileId={null} status="connected" detail="本机" onSelect={onSelect}/>);

    expect(document.querySelector(".terminal-target")).not.toHaveAttribute("data-remote");
    expect(document.querySelector(".terminal-target")).toHaveAttribute("data-status", "connected");

    await user.click(screen.getByRole("button", { name: "选择终端连接，当前：本地终端" }));
    const menu = screen.getByRole("dialog", { name: "选择终端连接" });
    expect(document.querySelector(".terminal-target")).not.toContainElement(menu);
    expect(within(menu).getByRole("button", { name: /本地终端/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(menu).getByText("最近使用")).toBeInTheDocument();
    expect(within(menu).getByText("deploy@prod.example:22")).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: /Personal/ })).not.toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: /Production/ }));
    expect(onSelect).toHaveBeenCalledWith("profile-1");
    expect(screen.queryByRole("dialog", { name: "选择终端连接" })).not.toBeInTheDocument();
  });

  it("shows at most six recent connections", async () => {
    const user = userEvent.setup();
    const recentProfiles = Array.from({ length: 7 }, (_, index) => ({
      id: `recent-${index + 1}`, name: `Recent ${index + 1}`, host: `recent-${index + 1}.example`, port: 22, username: "ops", authPreference: "sshAgent" as const, credentialId: null, groupId: null,
    }));
    render(<TerminalTargetPicker profiles={recentProfiles} recentProfileIds={recentProfiles.map((profile) => profile.id)} selectedProfileId={null} status="closed" detail="" onSelect={vi.fn()} allowLocal={false}/>);

    await user.click(screen.getByRole("button", { name: "选择终端连接，当前：本地终端" }));
    const menu = screen.getByRole("dialog", { name: "选择终端连接" });
    expect(within(menu).getByRole("button", { name: /Recent 6/ })).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: /Recent 7/ })).not.toBeInTheDocument();
  });

  it("opens grouped connections in a secondary menu and keeps search results flat", async () => {
    const user = userEvent.setup();
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    render(<TerminalTargetPicker profiles={profiles} groups={groups} recentProfileIds={["profile-1"]} selectedProfileId="profile-1" status="connected" detail="deploy@prod.example" onSelect={vi.fn()}/>);

    expect(document.querySelector(".terminal-target")).toHaveAttribute("data-remote", "true");

    const trigger = screen.getByRole("button", { name: "选择终端连接，当前：Production" });
    const triggerRect = vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      bottom: 53, height: 23, left: 12, right: 202, top: 30, width: 190, x: 12, y: 30, toJSON: () => ({}),
    });
    await user.click(trigger);
    const picker = screen.getByRole("dialog", { name: "选择终端连接" });
    expect(picker).toHaveStyle({ maxHeight: "600px" });
    const initialPickerStyle = picker.getAttribute("style");
    const productionGroup = within(picker).getByRole("button", { name: /生产环境/ });
    expect(within(picker).getByRole("button", { name: /未分组/ })).toBeInTheDocument();
    await user.hover(productionGroup);
    const submenu = await screen.findByRole("dialog", { name: "生产环境连接" });
    expect(triggerRect).toHaveBeenCalledTimes(1);
    expect(picker).toHaveAttribute("style", initialPickerStyle ?? "");
    expect(within(submenu).getByRole("button", { name: /Production/ })).toBeInTheDocument();
    expect(within(submenu).getByRole("button", { name: /Bastion/ })).toBeInTheDocument();
    const submenuList = submenu.querySelector(".terminal-target-submenu-list");
    expect(submenuList).not.toBeNull();
    Object.defineProperties(submenuList!, {
      clientHeight: { configurable: true, value: 80 },
      scrollHeight: { configurable: true, value: 164 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    act(() => animationFrames.splice(0).forEach((callback) => callback(0)));
    expect(submenu).toHaveAttribute("data-scrollable", "true");
    expect(submenu).toHaveAttribute("data-scrollbar-visible", "true");
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1_200);
    const hideScrollbar = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 1_200)?.[0];
    act(() => { if (typeof hideScrollbar === "function") hideScrollbar(); });
    expect(submenu).toHaveAttribute("data-scrollbar-visible", "false");
    (submenuList as HTMLDivElement).scrollTop = 32;
    fireEvent.scroll(submenuList!);
    expect(triggerRect).toHaveBeenCalledTimes(1);
    expect(submenu).toHaveAttribute("data-scrollbar-visible", "true");
    expect(submenu.style.getPropertyValue("--terminal-target-scroll-thumb-offset")).toBe("16px");
    expect(submenu.querySelector(".terminal-target-scrollbar")).toBeInTheDocument();

    const search = within(picker).getByRole("searchbox", { name: "搜索终端连接" });
    await user.type(search, "qiubai");
    expect(within(picker).getByRole("button", { name: /Personal/ })).toBeInTheDocument();
    expect(within(picker).queryByRole("button", { name: /Production/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "生产环境连接" })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "jump.example");
    expect(within(picker).getByRole("button", { name: /Bastion/ })).toBeInTheDocument();
  });

  it("opens a group by click and returns to it with Escape", async () => {
    const user = userEvent.setup();
    render(<TerminalTargetPicker profiles={profiles} groups={groups} recentProfileIds={[]} selectedProfileId={null} status="connected" detail="本机" onSelect={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "选择终端连接，当前：本地终端" }));
    const group = screen.getByRole("button", { name: /生产环境/ });
    await user.click(group);
    expect(screen.getByRole("dialog", { name: "生产环境连接" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "生产环境连接" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "选择终端连接" })).toBeInTheDocument();
    expect(group).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    const keyboardSubmenu = screen.getByRole("dialog", { name: "生产环境连接" });
    await waitFor(() => expect(within(keyboardSubmenu).getByRole("button", { name: /Production/ })).toHaveFocus());
  });

  it("opens connection management from its persistent footer", async () => {
    const user = userEvent.setup();
    const onManageConnections = vi.fn();
    render(<TerminalTargetPicker profiles={profiles} groups={groups} selectedProfileId={null} status="connected" detail="本机" onSelect={vi.fn()} onManageConnections={onManageConnections}/>);

    await user.click(screen.getByRole("button", { name: "选择终端连接，当前：本地终端" }));
    await user.click(screen.getByRole("button", { name: "管理连接…" }));
    expect(onManageConnections).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "选择终端连接" })).not.toBeInTheDocument();
  });

  it("uses the connection name itself as the picker affordance and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(<TerminalTargetPicker profiles={profiles} groups={groups} selectedProfileId="profile-1" status="connected" detail="deploy@prod.example" onSelect={vi.fn()}/>);

    const trigger = screen.getByRole("button", { name: "选择终端连接，当前：Production" });
    expect(trigger.querySelector(".terminal-target-menu-icon")).not.toBeInTheDocument();
    expect(trigger.querySelector(".terminal-target-chevron")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "选择终端连接" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "选择终端连接" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("turns a connected remote endpoint into the shared host summary entry", () => {
    const onRequestDisconnect = vi.fn();
    render(<TerminalTargetPicker profiles={profiles} groups={groups} selectedProfileId="profile-1" status="connected" detail="deploy@prod.example" onSelect={vi.fn()} onRequestDisconnect={onRequestDisconnect}/>);

    expect(screen.getByRole("button", { name: /查看 Production 主机概要/ })).toHaveClass("host-identity-trigger", "terminal-target-endpoint");
    expect(screen.queryByText("deploy@prod.example", { selector: "small" })).not.toBeInTheDocument();
  });

  it("places reconnect directly after the closed status", async () => {
    const user = userEvent.setup();
    const onReconnect = vi.fn();
    const { container } = render(<TerminalTargetPicker profiles={profiles} selectedProfileId="profile-1" status="closed" detail="closed" onSelect={vi.fn()} statusAction={{ label: "重新连接", icon: "refresh", onSelect: onReconnect }}/>);

    const status = screen.getByText("closed", { selector: "small" });
    const action = screen.getByRole("button", { name: "重新连接" });
    expect(status.nextElementSibling).toBe(action);
    expect(container.querySelector(".terminal-target-status-action")).toBe(action);
    await user.click(action);
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it("keeps local and disconnected details non-interactive", () => {
    const { rerender } = render(<TerminalTargetPicker profiles={profiles} selectedProfileId={null} status="connected" detail="本机" onSelect={vi.fn()}/>);
    expect(screen.getByText("本机", { selector: "small" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /主机概要/ })).not.toBeInTheDocument();

    rerender(<TerminalTargetPicker profiles={profiles} selectedProfileId="profile-1" status="closed" detail="closed" onSelect={vi.fn()}/>);
    expect(screen.getByText("closed", { selector: "small" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /主机概要/ })).not.toBeInTheDocument();
  });
});
