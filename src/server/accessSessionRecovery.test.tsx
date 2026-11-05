import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useServerAccess } from "./useServerAccess";
import { serverTerminalLock } from "./terminalLock";
import { dataPaused, resumeData } from "./dataAccess";
import { control, openSession, openSocket } from "./sessionTransport";
import { listRemoteDirectory } from "./services/files";

const identity = vi.hoisted(() => ({ key: "" }));
vi.mock("./accessIdentity", () => ({
  accessProof: () => ({ accessKey: identity.key, clientId: "page" }),
  accessHeaders: () => ({}),
  rememberAccess: (key: string) => { identity.key = key; },
}));
vi.mock("../app/theme/AppThemeProvider", () => ({ bootstrapAppTheme: vi.fn() }));
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1; bufferedAmount = 0;
  onopen?: () => void;
  onmessage?: (event: { data: unknown }) => void;
  onclose?: () => void;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.onclose?.(); });
  constructor(public url: string) { Socket.instances.push(this); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
const fetchMock = vi.fn();
const consume = (_data: Uint8Array, done?: () => void) => done?.();
const ids = ["terminal", "files", "local"];
beforeEach(() => {
  vi.useFakeTimers(); identity.key = ""; Socket.instances = []; resumeData();
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    const path = url.replace("/api/v1", "");
    const responses: Record<string, unknown> = {
      "/login": { authenticated: true, accessKey: "key" },
      "/auth": { authenticated: true },
      "/terminal-lock": { locked: true },
      "/terminal-lock/unlock": { locked: false },
      "/runtime/sessions": ids.map(sessionId => ({ sessionId })),
      "/files/list": { path: "/work", entries: [] },
    };
    if (!(path in responses)) throw new Error(`Unexpected request: ${path}`);
    return { ok: true, status: 200, json: async () => responses[path] };
  });
});
afterEach(() => { cleanup(); resumeData(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each(["presence", "data"])("restores original sessions after %s disconnects first, without refreshing", async first => {
  const view = renderHook(useServerAccess);
  await act(() => view.result.current.login("access-password"));
  let presence = Socket.instances[0];
  await act(async () => presence.message({ type: "ready" }));
  await act(() => serverTerminalLock.unlock("master-password"));
  const events = ids.map(() => vi.fn());
  const input = { profileId: "remote", auth: { method: "password" as const, password: "ssh-password" } };
  const pending = [
    openSession("terminal", input, events[0], consume),
    openSession("files", input, events[1]),
    openSocket("/local/sessions", { version: 1 }, events[2], consume),
  ];
  function restore(socket: Socket, index: number) {
    socket.onopen?.();
    socket.message({ type: "ready", sessionId: ids[index], cwd: "/work" });
    socket.message({ type: "event", event: { type: "stateChanged", state: "connected" } });
    socket.message({ type: "restored" });
  }
  let sockets = Socket.instances.slice(1);
  sockets.forEach(restore);
  await Promise.all(pending);

  // Repeated interruptions must keep the same owners and reconnect subscriptions.
  for (let attempt = 0; attempt < 2; attempt++) {
    events.forEach(event => event.mockClear());
    await act(async () => {
      if (first === "data") sockets.forEach(socket => socket.close());
      presence.close();
    });
    expect(view.result.current.phase).toBe("reconnecting");
    expect(dataPaused()).toBe(true);
    expect(() => control("terminal", new Uint8Array([13]))).toThrow("终端已锁定");
    const count = Socket.instances.length;
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(Socket.instances).toHaveLength(count + 1);
    presence = Socket.instances[Socket.instances.length - 1];
    expect(String(presence.url)).toContain("/access");
    await act(async () => presence.message({ type: "ready" }));
    expect(view.result.current.phase).toBe("workspace");
    expect(dataPaused()).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(Socket.instances).toHaveLength(count + 1);
    await act(() => serverTerminalLock.unlock("master-password"));
    expect(Socket.instances).toHaveLength(count + 4);
    sockets = Socket.instances.slice(-3);
    sockets.forEach((socket, index) => {
      expect(String(socket.url)).toContain("/runtime/attach");
      expect(() => control(ids[index], new Uint8Array([13]))).toThrow("画面正在恢复");
      restore(socket, index);
      expect(socket.send.mock.calls).toEqual([[JSON.stringify({ version: 2, sessionId: ids[index], accessKey: "key", clientId: "page" })]]);
      expect(events[index]).toHaveBeenLastCalledWith({ type: "stateChanged", state: "connected" });
    });
    for (const index of [0, 2]) {
      const data = new Uint8Array([65, 13]);
      control(ids[index], data);
      expect(sockets[index].send).toHaveBeenLastCalledWith(data);
    }
    expect(await listRemoteDirectory("files", "/work")).toEqual({ path: "/work", entries: [] });
  }
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/v1/login")).toHaveLength(1);
  expect(fetchMock.mock.calls.some(([, init]) => init.method === "DELETE")).toBe(false);
  await act(async () => presence.message({ type: "revoked", reason: "sessionReplaced" }));
  expect(view.result.current.phase).toBe("replaced");
  const count = Socket.instances.length;
  // Even a later resume cannot revive sessions after the identity was revoked.
  resumeData();
  await act(() => vi.advanceTimersByTimeAsync(20000));
  expect(Socket.instances).toHaveLength(count);
  expect(() => control("terminal", new Uint8Array([13]))).toThrow("重新接入");
});
