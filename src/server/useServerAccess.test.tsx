import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useServerAccess } from "./useServerAccess";
const mocks=vi.hoisted(()=>({api:vi.fn(),key:"",presence:vi.fn(),stop:vi.fn(),close:vi.fn(),theme:vi.fn(),lock:vi.fn()}));
vi.mock("./terminalLock",()=>({serverTerminalLock:{read:mocks.lock},resetServerTerminalLock:vi.fn()}));
vi.mock("./http",()=>({api:mocks.api,AUTH_EXPIRED:"expired",message:(error:Error)=>error.message}));
vi.mock("./accessIdentity",()=>({accessProof:()=>({clientId:"page",accessKey:mocks.key}),rememberAccess:(key:string)=>{mocks.key=key;}}));
vi.mock("./accessPresence",()=>({openAccessPresence:mocks.presence}));
vi.mock("./sessionTransport",()=>({closeAllSessions:mocks.close}));
vi.mock("../app/theme/AppThemeProvider",()=>({bootstrapAppTheme:mocks.theme}));
beforeEach(()=>{vi.clearAllMocks();mocks.key="";mocks.lock.mockResolvedValue({locked:false});mocks.theme.mockResolvedValue(undefined);mocks.presence.mockReturnValue(mocks.stop);});
afterEach(cleanup);
it("checks occupancy without mounting a workspace and cancellation makes no takeover request",async()=>{
  mocks.api.mockResolvedValue({authenticated:false,takeoverTicket:"ticket"});
  const view=renderHook(useServerAccess);
  await waitFor(()=>expect(view.result.current.phase).toBe("login"));
  await act(()=>view.result.current.login("test password"));
  expect(view.result.current.phase).toBe("occupied");expect(mocks.presence).not.toHaveBeenCalled();
  act(()=>view.result.current.cancel());expect(view.result.current.phase).toBe("login");
  expect(mocks.api.mock.calls.map(call=>call[0])).toEqual(["/login"]);
});
it("confirms takeover explicitly and waits for server presence before opening the workspace",async()=>{
  mocks.api.mockResolvedValueOnce({authenticated:false,takeoverTicket:"ticket"}).mockResolvedValueOnce({authenticated:true,accessKey:"new-key"});
  const view=renderHook(useServerAccess);
  await act(()=>view.result.current.login("test password"));
  await act(()=>view.result.current.takeover());
  expect(mocks.api).toHaveBeenLastCalledWith("/access/takeover","POST",{ticket:"ticket",clientId:"page"});
  expect(mocks.key).toBe("new-key");expect(view.result.current.phase).toBe("checking");
  await act(async()=>{mocks.presence.mock.calls[0][0]();});
  expect(view.result.current.phase).toBe("workspace");
  act(()=>window.dispatchEvent(new CustomEvent("expired",{detail:"sessionReplaced"})));
  expect(view.result.current.phase).toBe("replaced");expect(view.result.current.error).toContain("被其他会话接管");
  expect(mocks.stop).toHaveBeenCalled();expect(mocks.close).toHaveBeenCalled();expect(mocks.key).toBe("");
  // Repeated failures and callbacks from the revoked transport cannot skip acknowledgment.
  act(()=>window.dispatchEvent(new CustomEvent("expired",{detail:"unauthorized"})));
  await act(async()=>{mocks.presence.mock.calls[0][0]();mocks.presence.mock.calls[0][1]();});
  expect(view.result.current.phase).toBe("replaced");
  act(()=>view.result.current.acknowledgeReplaced());
  expect(view.result.current.phase).toBe("login");expect(view.result.current.error).toBe("");
  expect(mocks.api).toHaveBeenCalledTimes(2);
});
it("refresh resumes with the stored proof and no password replay or takeover",async()=>{
  mocks.key="stored";mocks.api.mockResolvedValue({authenticated:true,accessKey:"stored"});
  const view=renderHook(useServerAccess);
  await waitFor(()=>expect(mocks.presence).toHaveBeenCalledOnce());
  await act(async()=>{mocks.presence.mock.calls[0][0]();});
  expect(view.result.current.phase).toBe("workspace");
  expect(mocks.api).toHaveBeenCalledWith("/access/resume","POST",{accessKey:"stored",clientId:"page"});
  expect(mocks.api).toHaveBeenCalledTimes(1);
  act(()=>window.dispatchEvent(new CustomEvent("expired",{detail:"unauthorized"})));
  expect(view.result.current.phase).toBe("login");
  expect(view.result.current.error).toBe("登录已失效，请重新登录");
});
it("expired or competing takeover returns to login without silently retrying",async()=>{
  mocks.api.mockResolvedValueOnce({authenticated:false,takeoverTicket:"ticket"}).mockRejectedValueOnce(new Error("连接状态已变化"));
  const view=renderHook(useServerAccess);
  await act(()=>view.result.current.login("test password"));await act(()=>view.result.current.takeover());
  expect(view.result.current.phase).toBe("login");expect(view.result.current.error).toBe("连接状态已变化");
  expect(mocks.api).toHaveBeenCalledTimes(2);expect(mocks.presence).not.toHaveBeenCalled();
});

it("does not fetch settings before a locked refresh reaches the lock boundary",async()=>{
  mocks.key="stored";mocks.api.mockResolvedValue({authenticated:true,accessKey:"stored"});mocks.lock.mockResolvedValue({locked:true});
  const view=renderHook(useServerAccess);
  await waitFor(()=>expect(mocks.presence).toHaveBeenCalledOnce());
  await act(async()=>{mocks.presence.mock.calls[0][0]();});
  expect(view.result.current.phase).toBe("workspace");expect(mocks.theme).not.toHaveBeenCalled();
});
