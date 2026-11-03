import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({connect:vi.fn(),drag:vi.fn(),maximize:vi.fn(),phase:"login"}));
vi.mock("./transport",()=>({connectRuntime:mocks.connect,disconnectRuntime:vi.fn()}));
vi.mock("./selection",()=>({selectedRuntime:{name:"测试服务器",endpoint:"https://server.example"}}));
vi.mock("../server/http",()=>({configureRuntimeApi:vi.fn()}));
vi.mock("../server/ServerApp",()=>({ServerApp:({renderChrome}:{renderChrome:(access:unknown)=>ReactNode})=><>{renderChrome({phase:mocks.phase,logout:vi.fn()})}<input aria-label="访问密码"/></>}));
vi.mock("./EnvironmentControl",()=>({EnvironmentControl:()=> <button>服务器菜单</button>}));
vi.mock("../workspace/NativeWindowControls",()=>({NativeWindowControls:()=> <button>置顶</button>}));
vi.mock("../server/accessLog/AccessLogControl",()=>({AccessLogControl:()=>null}));
vi.mock("../lib/tauri/window",()=>({currentDesktopPlatform:()=>"macos",startDraggingCurrentWindow:mocks.drag,toggleMaximizeCurrentWindow:mocks.maximize}));
import { RemoteDesktopApp } from "./RemoteDesktopApp";
import { resumeData } from "../server/dataAccess";
beforeEach(()=>{
  mocks.phase="login"; mocks.connect.mockResolvedValue("/api");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(()=>{cleanup();resumeData();vi.clearAllMocks();vi.unstubAllGlobals();});
const region = () => document.querySelector<HTMLElement>(".runtime-window-drag-region")!;
function move(target: HTMLElement) {
  fireEvent.pointerDown(target,{button:0,pointerId:1,clientX:200,clientY:20});
  fireEvent.pointerMove(window,{pointerId:1,clientX:212,clientY:20});
}
it.each(["login","checking","workspace","reconnecting","replaced"])("provides window dragging in %s while data access is paused", async phase=>{
  mocks.phase=phase; render(<RemoteDesktopApp/>);
  await screen.findByRole("button",{name:"服务器菜单"});
  expect(region()).toHaveAttribute("data-platform","macos");
  move(region()); expect(mocks.drag).toHaveBeenCalledOnce();
  move(screen.getByRole("button",{name:"服务器菜单"}));
  move(screen.getByRole("button",{name:"置顶"}));
  move(screen.getByRole("textbox",{name:"访问密码"}));
  expect(mocks.drag).toHaveBeenCalledOnce();
});
it("keeps startup draggable and removes the fallback when the workbench becomes active", async()=>{
  mocks.phase="workspace";
  let connect!:(value:string)=>void;
  mocks.connect.mockImplementation(()=>new Promise<string>(resolve=>{connect=resolve;}));
  render(<RemoteDesktopApp/>);
  move(region()); expect(mocks.drag).toHaveBeenCalledOnce();
  await act(async()=>connect("/api"));
  act(()=>resumeData());
  await waitFor(()=>expect(region()).toBeNull());
});
it("cleans pending drag gestures when authentication screens unmount", async()=>{
  const view=render(<RemoteDesktopApp/>);await screen.findByRole("button",{name:"服务器菜单"});
  fireEvent.pointerDown(region(),{button:0,pointerId:1,clientX:200,clientY:20});
  view.unmount();fireEvent.pointerMove(window,{pointerId:1,clientX:220,clientY:20});
  expect(mocks.drag).not.toHaveBeenCalled();
});
