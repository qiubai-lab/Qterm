import { afterEach, expect, it, vi } from "vitest";
import { api, AUTH_EXPIRED } from "./http";
import { dataLease, dataPaused, pauseData, resumeData } from "./dataAccess";

afterEach(() => { resumeData(); vi.unstubAllGlobals(); });

it("blocks business reads and writes while leaving only lock and access controls available", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response("{}")); vi.stubGlobal("fetch", fetch);
  pauseData();
  for (const [path, method] of [["/git/snapshot", "POST"], ["/workspace", "GET"], ["/settings", "GET"], ["/vault", "GET"], ["/vault/unlock", "POST"], ["/files/read", "POST"], ["/downloads/ticket", "GET"]]) {
    await expect(api(path, method)).rejects.toThrow("终端已锁定");
  }
  expect(fetch).not.toHaveBeenCalled();
  await api("/terminal-lock"); await api("/terminal-lock/unlock", "POST", {masterPassword:"test-only"}); await api("/auth");
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("aborts in-flight reads and rejects their late JSON even after a subsequent unlock", async () => {
  let finish!: (value: unknown) => void;
  const fetch = vi.fn().mockResolvedValue({ok:true,status:200,json:()=>new Promise(resolve=>{finish=resolve;})});
  vi.stubGlobal("fetch", fetch);
  const pending = api("/git/snapshot", "POST", {path:"/test"});
  const rejected = expect(pending).rejects.toThrow("终端已锁定");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  const signal = fetch.mock.calls[0][1].signal as AbortSignal;
  pauseData(); expect(signal.aborted).toBe(true); resumeData();
  finish({private:"late snapshot"}); await rejected;
  expect(dataLease().signal.aborted).toBe(false);
});

it("treats a server lock as suspension rather than expired login", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"code":"terminalLocked","message":"locked"}', {status:423})));
  const expired=vi.fn(); window.addEventListener(AUTH_EXPIRED, expired);
  try {
    await expect(api("/profiles")).rejects.toThrow("locked");
    expect(dataPaused()).toBe(true); expect(expired).not.toHaveBeenCalled();
  } finally { window.removeEventListener(AUTH_EXPIRED, expired); }
});
