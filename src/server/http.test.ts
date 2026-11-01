import { afterEach, describe, expect, it, vi } from "vitest";
import { api, AUTH_EXPIRED, RequestError } from "./http";

afterEach(() => vi.unstubAllGlobals());
describe("server HTTP authentication", () => {
  it("uses same-origin cookies and sends sensitive inputs only in the request body", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("null")); vi.stubGlobal("fetch", fetch);
    await api("/login", "POST", { password: "test-only-password" });
    expect(fetch).toHaveBeenCalledWith("/api/v1/login", expect.objectContaining({ credentials: "same-origin", cache: "no-store", body: '{"password":"test-only-password"}' }));
  });
  it("notifies the application when an authenticated request expires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"code":"unauthorized","message":"请重新登录"}', { status: 401 })));
    const expire = vi.fn(); window.addEventListener(AUTH_EXPIRED, expire);
    await expect(api("/profiles")).rejects.toBeInstanceOf(RequestError); expect(expire).toHaveBeenCalledOnce();
    window.removeEventListener(AUTH_EXPIRED, expire);
  });
  it("does not expire the application when the login password is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const expire = vi.fn(); window.addEventListener(AUTH_EXPIRED, expire);
    await expect(api("/login", "POST", {})).rejects.toThrow(); expect(expire).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED, expire);
  });
});
it("does not revoke a newer login because an older request returns late",async()=>{
  const {rememberAccess}=await import("./accessIdentity");
  let finish!:(response:Response)=>void;
  vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;})));
  const expired=vi.fn();window.addEventListener(AUTH_EXPIRED,expired);
  rememberAccess("old-key");const pending=api("/workspace");const rejected=expect(pending).rejects.toBeInstanceOf(RequestError);
  rememberAccess("new-key");finish(new Response('{"code":"sessionReplaced"}',{status:401}));
  await rejected;expect(expired).not.toHaveBeenCalled();
  rememberAccess("");window.removeEventListener(AUTH_EXPIRED,expired);
});
