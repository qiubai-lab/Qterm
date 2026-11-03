import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EnvironmentControl } from "./EnvironmentControl";
const mocks = vi.hoisted(() => ({connect:vi.fn(),flush:vi.fn(),disconnect:vi.fn()}));
vi.mock("./transport",()=>({connectRuntime:mocks.connect,disconnectRuntime:mocks.disconnect}));
vi.mock("./switchGuard",()=>({flushRuntime:mocks.flush,detachRuntime:vi.fn()}));
vi.mock("./selection",()=>({selectedRuntime:{id:"a",name:"生产服务器",endpoint:"https://server.example"},listServers:()=>[],saveServers:vi.fn(),selectRuntime:vi.fn()}));
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
