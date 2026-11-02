import { resumeData } from "./dataAccess";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./http";
import { serverTerminalLock } from "./terminalLock";

vi.mock("./http", () => ({ api: vi.fn() }));
afterEach(() => { resumeData(); vi.clearAllMocks(); });

it("reads session state and submits terminal lock actions to their dedicated endpoints", async () => {
  vi.mocked(api).mockResolvedValueOnce({ locked: true }).mockResolvedValueOnce({ locked: true }).mockResolvedValueOnce({ locked: false });
  expect(await serverTerminalLock.read()).toEqual({ locked: true });
  expect(await serverTerminalLock.lock()).toEqual({ locked: true });
  expect(await serverTerminalLock.unlock("test-master-password")).toEqual({ locked: false });
  expect(vi.mocked(api).mock.calls).toEqual([
    ["/terminal-lock", "GET", undefined], ["/terminal-lock/lock", "POST", undefined],
    ["/terminal-lock/unlock", "POST", { masterPassword: "test-master-password" }],
  ]);
});

it.each([null, {}, { locked: "false" }])("rejects an invalid status instead of treating it as unlocked: %j", async response => {
  vi.mocked(api).mockResolvedValue(response);
  await expect(serverTerminalLock.read()).rejects.toThrow("无法确认终端锁定状态");
});

it("cannot reopen data access with a status response from a retired page lifetime",async()=>{
  const {resetServerTerminalLock}=await import("./terminalLock");
  const {dataPaused}=await import("./dataAccess");
  let finish!:(value:{locked:boolean})=>void;
  vi.mocked(api).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=serverTerminalLock.read();resetServerTerminalLock();finish({locked:false});
  await pending;expect(dataPaused()).toBe(true);
});
