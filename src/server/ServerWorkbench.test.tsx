import { useEffect, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ServerWorkbench } from "./ServerWorkbench";
import { dataPaused, pauseData, resumeData } from "./dataAccess";
import type { useTerminalLock } from "../workspace/useTerminalLock";

const mocks=vi.hoisted(()=>({api:vi.fn(),mount:vi.fn(),unmount:vi.fn(),restore:vi.fn()}));
vi.mock("../app/theme/AppThemeProvider",()=>({useAppTheme:()=>({commitTheme:()=>{}})}));
vi.mock("./http",()=>({api:mocks.api}));
function Pass({children}:{children:ReactNode}) { return children; }
vi.mock("../workspace/WorkspaceProvider",()=>({WorkspaceProvider:Pass}));
vi.mock("../onboarding/OnboardingProvider",()=>({OnboardingProvider:Pass}));
vi.mock("../terminal/notifications/TerminalNotificationProvider",()=>({TerminalNotificationProvider:Pass}));
vi.mock("../workspace/WorkspaceTerminalLinkHost",()=>({WorkspaceTerminalLinkHost:()=>null}));
vi.mock("./ServerRuntimeRestore",()=>({ServerRuntimeRestore:function Restore(){useEffect(()=>{mocks.restore();},[]);return null;}}));
vi.mock("../workspace/WorkspaceShell",()=>({WorkspaceShell:function Shell({terminalLockState:lock}:{terminalLockState:ReturnType<typeof useTerminalLock>}){
  const [draft,setDraft]=useState("");
  useEffect(()=>{mocks.mount();return mocks.unmount;},[]);
  return <><input aria-label="文件草稿" value={draft} onChange={e=>setDraft(e.target.value)}/><button onClick={()=>void lock.lock(true)}>锁定测试工作区</button></>;
}}));
beforeEach(()=>{vi.clearAllMocks();pauseData();});
afterEach(()=>{cleanup();resumeData();});

it("mounts no workspace readers while checking, after failure, or on a locked refresh",async()=>{
  let resolve!:(value:unknown)=>void;
  mocks.api.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  render(<ServerWorkbench onLogout={vi.fn()}/>);
  expect(mocks.mount).not.toHaveBeenCalled();expect(mocks.restore).not.toHaveBeenCalled();
  await waitFor(()=>expect(resolve).toBeTypeOf("function"));
  await act(async()=>resolve({locked:true}));
  expect(screen.getByRole("heading",{name:"终端已锁定"})).toBeInTheDocument();
  expect(mocks.mount).not.toHaveBeenCalled();expect(mocks.api).toHaveBeenCalledTimes(1);
  mocks.api.mockRejectedValueOnce(new Error("wrong password"));
  fireEvent.change(screen.getByLabelText("主密码"),{target:{value:"incorrect-password"}});
  fireEvent.click(screen.getByRole("button",{name:"解锁终端和凭证"}));
  await screen.findByText("wrong password");
  expect(dataPaused()).toBe(true);expect(mocks.mount).not.toHaveBeenCalled();
});

it("preserves unsaved drafts across lock/unlock without remounting the runtime owners",async()=>{
  mocks.api.mockResolvedValueOnce({locked:false}).mockResolvedValueOnce({locked:true}).mockResolvedValueOnce({locked:false});
  render(<ServerWorkbench onLogout={vi.fn()}/>);
  const draft=await screen.findByLabelText("文件草稿");
  fireEvent.change(draft,{target:{value:"unsaved content"}});
  fireEvent.click(screen.getByText("锁定测试工作区"));
  await screen.findByRole("heading",{name:"终端已锁定"});
  expect(draft.closest("[hidden]")).not.toBeNull();expect(dataPaused()).toBe(true);
  fireEvent.change(screen.getByLabelText("主密码"),{target:{value:"correct-master-password"}});
  fireEvent.click(screen.getByRole("button",{name:"解锁终端和凭证"}));
  await waitFor(()=>expect(dataPaused()).toBe(false));
  expect(screen.getByLabelText("文件草稿")).toHaveValue("unsaved content");
  expect(mocks.mount).toHaveBeenCalledOnce();expect(mocks.unmount).not.toHaveBeenCalled();
});

it("keeps readers unmounted when the initial lock check fails and permits retry",async()=>{
  mocks.api.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({locked:false});
  render(<ServerWorkbench onLogout={vi.fn()}/>);
  await screen.findByText("无法确认终端锁定状态，请重试。");
  expect(mocks.mount).not.toHaveBeenCalled();expect(dataPaused()).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"重试"}));
  await screen.findByLabelText("文件草稿");expect(mocks.mount).toHaveBeenCalledOnce();
});
