import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EnvironmentControl } from "./EnvironmentControl";
import { ThemedTitleTooltipProvider } from "../components/ThemedTitleTooltipProvider";
const mocks = vi.hoisted(() => ({connect:vi.fn(),flush:vi.fn(),disconnect:vi.fn(),select:vi.fn(),detach:vi.fn()}));
vi.mock("./transport",()=>({connectRuntime:mocks.connect,disconnectRuntime:mocks.disconnect}));
vi.mock("./switchGuard",()=>({flushRuntime:mocks.flush,detachRuntime:mocks.detach}));
vi.mock("./selection",()=>({selectedRuntime:{id:"a",name:"生产服务器",endpoint:"https://server.example"},listServers:()=>[{id:"b",name:"测试服务器",endpoint:"https://test.example"}],saveServers:vi.fn(),selectRuntime:mocks.select}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it("keeps remote identity during reconnect and opens a keyboard accessible menu", () => {
  render(<EnvironmentControl status="重连中"/>);
  const trigger=screen.getByRole("button",{name:"运行环境：生产服务器，重连中"});
  fireEvent.click(trigger);
  expect(screen.getByRole("menu",{name:"切换运行环境"})).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("menu"),{key:"Escape"});
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

function startConnection() {
  fireEvent.click(screen.getByRole("button", { name: /运行环境/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /测试服务器/ }));
  fireEvent.click(screen.getByRole("button", { name: "连接" }));
}

it.each(["save", "logout", "connect", "detach"])("allows cancellation during %s without committing late results", async stage => {
  let finish!: () => void;
  const logout = vi.fn();
  const actions = [mocks.flush, logout, mocks.connect, mocks.detach];
  const index = ["save", "logout", "connect", "detach"].indexOf(stage);
  actions[index].mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<EnvironmentControl onLogout={logout}/>);
  startConnection();
  await waitFor(() => expect(actions[index]).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await act(async () => { finish(); });
  expect(mocks.select).not.toHaveBeenCalled();
  actions.slice(index + 1).forEach(action => expect(action).not.toHaveBeenCalled());
  if (index >= 2) expect(mocks.disconnect).toHaveBeenCalledOnce();
  else expect(mocks.disconnect).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it.each(["Escape", "close", "unmount"])("cancels pending work on %s", async method => {
  let finish!: () => void;
  mocks.connect.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const view = render(<EnvironmentControl/>);
  startConnection();
  await waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce());
  if (method === "Escape") fireEvent.keyDown(window, { key: "Escape" });
  else if (method === "close") fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  else view.unmount();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await act(async () => { finish(); });
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.detach).not.toHaveBeenCalled();
});

it("does not display a cancelled attempt's late error in a newly opened dialog", async () => {
  let fail!: (reason: Error) => void;
  mocks.connect.mockImplementation(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
  render(<EnvironmentControl/>);
  startConnection();
  await waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  fireEvent.click(screen.getByRole("button", { name: /运行环境/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /测试服务器/ }));
  await act(async () => { fail(new Error("旧连接失败")); });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "连接" })).toBeEnabled();
});

it("shows only the connection error and preserves the complete overflow tooltip", async () => {
  const message = "无法连接服务器，请检查地址、网络与证书：远程服务器的 TLS 证书已过期";
  mocks.connect.mockRejectedValue(message);
  render(<ThemedTitleTooltipProvider><EnvironmentControl/></ThemedTitleTooltipProvider>);
  startConnection();
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(message);
  expect(alert).toHaveAttribute("title", message);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(mocks.detach).not.toHaveBeenCalled();
  Object.defineProperties(alert, { scrollWidth: { value: 500 }, clientWidth: { value: 180 } });
  fireEvent.pointerOver(alert);
  expect(screen.getByRole("tooltip")).toHaveTextContent(message);
});
it("does not log out or change transport when a draft cannot be saved", async () => {
  mocks.flush.mockRejectedValue(new Error("草稿尚未同步")); const logout=vi.fn();
  render(<EnvironmentControl status="已连接" onLogout={logout}/>);
  fireEvent.click(screen.getByRole("button",{name:/运行环境/}));
  fireEvent.click(screen.getByRole("menuitem",{name:"切换到本机"}));
  fireEvent.click(screen.getByRole("button",{name:"返回本机"}));
  await waitFor(()=>expect(screen.getByText("草稿尚未同步")).toBeInTheDocument());
  expect(logout).not.toHaveBeenCalled(); expect(mocks.disconnect).not.toHaveBeenCalled();
});
it("separates the connected identity tag from the icon-only menu entry", () => {
  render(<EnvironmentControl status="已连接"/>);
  const trigger = screen.getByRole("button", {name:"运行环境：生产服务器，已连接"});
  expect(trigger).toHaveTextContent("");
  const tag = screen.getByLabelText("生产服务器，已连接");
  expect(tag.tagName).toBe("SPAN");
  expect(tag).toHaveTextContent("生产服务器");
  fireEvent.click(trigger);
  expect(screen.getAllByRole("menuitem", {name:/本机/})).toHaveLength(1);
  expect(screen.getByRole("menuitem", {name:"管理服务器…"})).toBeInTheDocument();
});

it.each(["需要登录", "已锁定"])("keeps the environment menu usable while %s and allows returning locally", async status => {
  document.documentElement.dataset.webDataPaused = "true";
  try {
    render(<EnvironmentControl status={status}/>);
    fireEvent.click(screen.getByRole("button", {name:/运行环境/}));
    expect(screen.getByRole("menu")).toHaveAttribute("data-runtime-control-plane", "environment-menu");
    fireEvent.click(screen.getByRole("menuitem", {name:"切换到本机"}));
    fireEvent.click(screen.getByRole("button", {name:"返回本机"}));
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.select).toHaveBeenCalledWith(null));
  } finally { delete document.documentElement.dataset.webDataPaused; }
});

it("shows progress and a spinner while saving and recovers after failure", async () => {
  let fail!: (error: Error) => void;
  mocks.flush.mockImplementation(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
  render(<EnvironmentControl/>);
  fireEvent.click(screen.getByRole("button", {name:/运行环境/}));
  fireEvent.click(screen.getByRole("menuitem", {name:"切换到本机"}));
  fireEvent.click(screen.getByRole("button", {name:"返回本机"}));
  expect(screen.getByRole("status")).toHaveTextContent("正在保存工作台…");
  expect(screen.getByRole("button", {name:"切换中…"})).toHaveAttribute("aria-busy", "true");
  expect(document.querySelector(".runtime-switch-spinner")).toBeInTheDocument();
  fail(new Error("保存失败"));
  await waitFor(() => expect(screen.getByRole("button", {name:"取消"})).toBeEnabled());
});
