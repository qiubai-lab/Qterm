import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openAccessPresence } from "./accessPresence";
import { AUTH_EXPIRED } from "./http";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./http", () => ({ API:"/api/v1", AUTH_EXPIRED:"expired", api:mocks.api }));
vi.mock("./vaultStatus", () => ({ vaultStatus:{receive:vi.fn(),beginConnection:vi.fn()} }));

class Socket {
  static current: Socket;
  onmessage?: (event: {data:string}) => void;
  onclose?: () => void;
  close = vi.fn(() => this.onclose?.());
  constructor() { Socket.current = this; }
  receive(value: unknown) { this.onmessage?.({data:JSON.stringify(value)}); }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("WebSocket", Socket); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each(["sessionReplaced", "unauthorized", undefined])("preserves the revocation reason %s and stops retries", reason => {
  const listener = vi.fn();
  window.addEventListener(AUTH_EXPIRED, listener);
  const disconnected = vi.fn();
  const stop = openAccessPresence(vi.fn(), disconnected);
  try {
    Socket.current.receive({type:"revoked",reason});
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toBe(reason === "sessionReplaced" ? reason : "unauthorized");
    expect(disconnected).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(mocks.api).not.toHaveBeenCalled();
  } finally { stop(); window.removeEventListener(AUTH_EXPIRED, listener); }
});

it("reports transport interruption without claiming another session took over", () => {
  const listener = vi.fn();
  window.addEventListener(AUTH_EXPIRED, listener);
  const disconnected = vi.fn();
  const stop = openAccessPresence(vi.fn(), disconnected);
  try {
    Socket.current.onclose?.();
    expect(disconnected).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
  } finally { stop(); window.removeEventListener(AUTH_EXPIRED, listener); }
});

it("rechecks admission on foreground/network recovery and ignores late old-socket messages", async () => {
  mocks.api.mockResolvedValue({authenticated:true});
  vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
  const ready=vi.fn(), disconnected=vi.fn();
  const stop=openAccessPresence(ready,disconnected);
  const previous=Socket.current;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(disconnected).toHaveBeenCalledOnce();
  expect(previous.close).toHaveBeenCalledOnce();
  previous.receive({type:"ready"});expect(ready).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(250);
  expect(mocks.api).toHaveBeenCalledWith("/auth");
  expect(Socket.current).not.toBe(previous);
  Socket.current.receive({type:"ready"});expect(ready).toHaveBeenCalledOnce();
  stop();window.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(5000);
  expect(mocks.api).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
});

it("does not reconnect after stop when a resume admission request resolves late", async () => {
  let resolve!:()=>void;
  mocks.api.mockReturnValue(new Promise<void>(done=>{resolve=done;}));
  const stop=openAccessPresence(vi.fn(),vi.fn());
  const previous=Socket.current;
  window.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(250);
  stop();resolve();await vi.advanceTimersByTimeAsync(3000);
  expect(Socket.current).toBe(previous);
});
