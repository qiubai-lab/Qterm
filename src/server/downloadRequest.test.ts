import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({remote:false,api:vi.fn(),request:vi.fn(),stream:vi.fn(),cancel:vi.fn(),select:vi.fn()}));
vi.mock("../lib/runtime/environment", () => ({get isRemoteDesktop(){return mocks.remote;}}));
vi.mock("./http", () => ({API:"/api/v1",api:mocks.api,request:mocks.request}));
vi.mock("../remoteRuntime/download", () => ({streamNativeDownload:mocks.stream,cancelNativeDownload:mocks.cancel,selectNativeDownload:mocks.select}));
import { pauseData, resumeData } from "./dataAccess";
import { downloadRequest, selectDownloadDestination } from "./downloadRequest";
beforeEach(() => { vi.resetAllMocks(); mocks.remote=false; mocks.cancel.mockResolvedValue(undefined); });
afterEach(() => { vi.useRealTimers(); resumeData(); });
it("reports preparation progress and hands off without reporting a completed save", async () => {
  vi.useFakeTimers();
  let finish!: (value:{id:string})=>void;
  mocks.api.mockImplementation((path:string) => path.endsWith("/progress") ? Promise.resolve({transferredBytes:40,totalBytes:100}) : new Promise(resolve => {finish=resolve;}));
  const click = vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>undefined);
  const event = vi.fn();
  const result = downloadRequest("local","/file","file",false,new AbortController().signal,new Set(),event);
  await vi.advanceTimersByTimeAsync(250);
  expect(event).toHaveBeenCalledWith({type:"progress",transferredBytes:40,totalBytes:100,message:"正在准备下载…"});
  finish({id:"ticket"});
  expect(await result).toBe(false);
  expect(click).toHaveBeenCalledOnce(); expect(event).toHaveBeenLastCalledWith({type:"handedOff"});
  expect(vi.getTimerCount()).toBe(0); click.mockRestore();
});
it("cleans the selected native destination if server preparation fails", async () => {
  mocks.remote=true; mocks.api.mockRejectedValue(new Error("failed"));
  await expect(downloadRequest("local","/file","destination",false,new AbortController().signal,new Set(),vi.fn())).rejects.toThrow("failed");
  expect(mocks.cancel).toHaveBeenCalledWith("destination");
  expect(mocks.stream).not.toHaveBeenCalled();
});
it("does not finish a desktop transfer until streaming has committed", async () => {
  mocks.remote=true;
  mocks.api.mockResolvedValue({id:"ticket"}); mocks.request.mockResolvedValue(new Response("file"));
  let finish!:()=>void;
  mocks.stream.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const result = downloadRequest("local","/file","destination",false,new AbortController().signal,new Set(),vi.fn());
  let done=false; void result.then(()=>{done=true;});
  await vi.waitFor(()=>expect(mocks.stream).toHaveBeenCalled());
  expect(done).toBe(false); finish(); expect(await result).toBe(true);
});

it("selects a native destination before making any network request", async () => {
  mocks.remote=true; mocks.select.mockResolvedValue("destination");
  expect(await selectDownloadDestination("file.bin")).toBe("destination");
  expect(mocks.select).toHaveBeenCalledWith("file.bin");
  expect(mocks.api).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
});
it("discards a destination selected after the workbench was locked", async () => {
  mocks.remote=true; mocks.select.mockImplementation(async()=>{pauseData();return "destination";});
  await expect(selectDownloadDestination("file.bin")).rejects.toThrow("终端已锁定");
  expect(mocks.cancel).toHaveBeenCalledWith("destination");
});
