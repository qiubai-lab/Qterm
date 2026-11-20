import { render, screen, within, fireEvent, act, cleanup } from "@testing-library/react";
import { expect, it, vi, afterEach } from "vitest";
import { DesktopEnvironments, serverKey } from "./environments";
import { EnvironmentTabsBar } from "./EnvironmentTabsBar";
afterEach(cleanup);

async function fixture() {
  const host = new DesktopEnvironments({ connect: async url => url, disconnect: async () => {} });
  const commands = () => ({ select: vi.fn(), create: vi.fn(), close: vi.fn(), countSessions: vi.fn(() => 0), prepareClose: vi.fn(async () => vi.fn()), rename: vi.fn(), reorder: vi.fn() });
  const local = commands(), remote = commands();
  const tabs = { activeId: "shared", enabled: true, items: [{id: "shared", name: "API"}, {id: "second", name: "日志"}] };
  host.workspacePort("local").publish(tabs, local);
  await host.connect({ id: "a", name: "开发服", endpoint: "https://a.test", tabColor: "#81a9cd" });
  const port = host.frame(host.find(serverKey("a"))!, vi.fn());
  port.status("已连接", vi.fn(), vi.fn(), () => 0);
  port.publish(tabs, remote);
  render(<EnvironmentTabsBar host={host}/>);
  return {host, port, local, remote};
}
it("chooses the environment at creation and focuses the current choice", async () => {
  const {local, remote} = await fixture();
  fireEvent.click(screen.getByRole("button", {name: "新建工作区"}));
  const menu = screen.getByRole("dialog", {name: "选择工作区来源"});
  expect(within(menu).getByRole("button", {name: /开发服.*https:\/\/a\.test.*已连接/})).toHaveFocus();
  fireEvent.keyDown(within(menu).getByRole("button", {name: /开发服/}), {key: "ArrowUp"});
  expect(within(menu).getByRole("button", {name: /本机/})).toHaveFocus();
  fireEvent.click(within(menu).getByRole("button", {name: /本机/}));
  expect(local.create).toHaveBeenCalledOnce();
  expect(remote.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", {name: "关闭 日志"})[1]);
  expect(remote.close).toHaveBeenCalledWith("second");
  expect(local.close).not.toHaveBeenCalled();
});
it.each(["重连中", "需要登录", "已被接管", "已锁定"])("retains %s tabs and leaves other environments usable", async status => {
  const {port, local, remote} = await fixture();
  act(() => port.status(status, vi.fn(), vi.fn(), () => 0));
  const remoteTab = screen.getAllByRole("button", {name: "API"})[1];
  expect(remoteTab).toHaveAccessibleDescription(status);
  expect(remoteTab.querySelector("svg")).toHaveAttribute("data-icon", status === "重连中" ? "serverSolid" : "lockSolid");
  fireEvent.click(screen.getByRole("button", {name: "新建工作区"}));
  expect(within(screen.getByRole("dialog")).getByRole("button", {name: new RegExp("开发服.*" + status)})).toBeDisabled();
  fireEvent.keyDown(window, {key: "Escape"});
  fireEvent.click(screen.getAllByRole("button", {name: "日志"})[0]);
  expect(local.select).toHaveBeenCalledWith("second");
  expect(remote.select).not.toHaveBeenCalled();
});

it("uses the original rename interaction and updates only the server glyph when its color changes", async () => {
  const {host, remote, local} = await fixture();
  const [localTab, remoteTab] = screen.getAllByRole("button", {name: "API"});
  expect(localTab.querySelector("svg")).toHaveAttribute("data-icon", "workspace");
  expect(remoteTab.querySelector("svg")).toHaveAttribute("data-icon", "serverSolid");
  expect(localTab.closest(".workspace-tab")).not.toHaveAttribute("data-source-color");
  const card = remoteTab.closest<HTMLElement>(".workspace-tab")!;
  expect(card.style.getPropertyValue("--workspace-source-color")).toBe("#81a9cd");
  fireEvent.doubleClick(remoteTab);
  const input = screen.getByRole("textbox", {name: "重命名 API"});
  fireEvent.change(input, {target: {value: "构建"}});
  fireEvent.keyDown(input, {key: "Enter"});
  expect(remote.rename).toHaveBeenCalledWith("shared", "构建");
  expect(local.rename).not.toHaveBeenCalled();
  const entry = host.find(serverKey("a"))!.entry!;
  act(() => host.renameEntries([{...entry, tabColor: null}]));
  expect(card).not.toHaveAttribute("data-source-color");
});

it("uses the shared batch confirmation and keeps identical local IDs out of its targets", async () => {
  const {local, remote} = await fixture();
  fireEvent.contextMenu(screen.getAllByRole("button", {name: "API"})[1]);
  fireEvent.click(screen.getByRole("menuitem", {name: "关闭其他工作区"}));
  fireEvent.click(screen.getByRole("button", {name: "关闭 1 个工作区"}));
  expect(remote.prepareClose).toHaveBeenCalledWith("shared", ["second"]);
  expect(local.prepareClose).not.toHaveBeenCalled();
});
