import { describe, expect, it, vi } from "vitest";
import { DesktopEnvironments, serverKey } from "./environments";

const a = { id: "a", name: "开发服", endpoint: "https://a.test" };
const b = { id: "b", name: "测试服", endpoint: "https://b.test" };
const actions = () => ({ create: vi.fn(), close: vi.fn(), countSessions: vi.fn(() => 0), prepareClose: vi.fn(async () => vi.fn()), select: vi.fn(), rename: vi.fn(), reorder: vi.fn() });
function setup() {
  const transport = { connect: vi.fn(async (url: string) => url + "/api"), disconnect: vi.fn(async (_id: string) => { void _id; }) };
  return { transport, host: new DesktopEnvironments(transport) };
}
async function open(host: DesktopEnvironments, entry: typeof a) {
  await host.connect(entry);
  const port = host.frame(host.find(serverKey(entry.id))!, vi.fn());
  const workspace = actions();
  port.publish({ activeId: "same", enabled: true, items: [{ id: "same", name: "API" }] }, workspace);
  const flush = vi.fn(async () => {});
  const leave = vi.fn(async () => {});
  port.status("已连接", leave, flush, () => 1);
  return { port, workspace, flush, leave };
}
describe("desktop environment ownership", () => {
  it("dispatches colliding workspace IDs to their owner and reuses the existing login", async () => {
    const { host, transport } = setup();
    const first = await open(host, a);
    const second = await open(host, b);
    host.focus(serverKey(a.id), "same");
    host.create(serverKey(b.id));
    await host.connect(a);
    expect(transport.connect).toHaveBeenCalledTimes(2);
    expect(first.workspace.select).toHaveBeenCalledWith("same");
    expect(first.workspace.create).not.toHaveBeenCalled();
    expect(second.workspace.create).toHaveBeenCalledOnce();
    expect(host.snapshot().active).toBe(serverKey(a.id));
  });
  it("flushes only the departing environment and restores focus to the last surviving one", async () => {
    const { host, transport } = setup();
    const first = await open(host, a);
    const second = await open(host, b);
    host.focus("local");
    host.focus(serverKey(b.id));
    await host.disconnect(serverKey(a.id));
    expect(host.snapshot().active).toBe(serverKey(b.id));
    expect(first.flush.mock.invocationCallOrder[0]).toBeLessThan(first.leave.mock.invocationCallOrder[0]);
    expect(transport.disconnect).toHaveBeenCalledWith(first.port.runtimeId);
    expect(second.flush).not.toHaveBeenCalled();
    await host.disconnect(serverKey(b.id));
    expect(host.snapshot().active).toBe("local");
  });
  it("keeps tabs and authentication intact on a failed save; old events cannot affect a subsequent admission", async () => {
    const { host, transport } = setup();
    const first = await open(host, a);
    first.flush.mockRejectedValueOnce(new Error("草稿同步失败"));
    await expect(host.disconnect(serverKey(a.id))).rejects.toThrow("草稿同步失败");
    expect(host.find(serverKey(a.id))?.tabs?.items).toHaveLength(1);
    expect(first.leave).not.toHaveBeenCalled();
    expect(transport.disconnect).not.toHaveBeenCalled();
    await host.disconnect(serverKey(a.id));
    const next = await open(host, a);
    first.port.status("已被接管", vi.fn(), vi.fn(), () => 0);
    expect(host.find(serverKey(a.id))?.status).toBe("已连接");
    expect(next.port.runtimeId).not.toBe(first.port.runtimeId);
  });
  it("retains disconnected tabs and enforces limits independently", async () => {
    const { host } = setup();
    const first = await open(host, a);
    const second = await open(host, b);
    first.port.publish({ activeId: "0", enabled: true, items: Array.from({length: 10}, (_, i) => ({id: String(i), name: String(i)})) }, first.workspace);
    host.create(serverKey(a.id));
    first.port.status("重连中", vi.fn(), vi.fn(), () => 0);
    host.create(serverKey(b.id));
    expect(first.workspace.create).not.toHaveBeenCalled();
    expect(host.commands(serverKey(a.id))).toBeUndefined();
    expect(host.find(serverKey(a.id))?.tabs?.items).toHaveLength(10);
    expect(second.workspace.create).toHaveBeenCalledOnce();
  });
  it("disposes a late connection result without disconnecting a second attempt", async () => {
    const { host, transport } = setup();
    let finish!: (base: string) => void;
    transport.connect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = host.connect(a);
    const old = host.find(serverKey(a.id))!.runtimeId;
    await host.disconnect(serverKey(a.id));
    await host.connect(a);
    finish("old");
    await first;
    expect(host.find(serverKey(a.id))?.apiBase).toBe(a.endpoint + "/api");
    expect(transport.disconnect.mock.calls).toEqual([[old], [old]]);
  });
});

it("restores only tab titles for the same saved endpoint while authentication is pending", async () => {
  const entry = { ...a, id: "tab-history-test" };
  const { host } = setup();
  const { port, workspace } = await open(host, entry);
  port.publish({ activeId: "t", enabled: true, items: [{ id: "t", name: "部署日志", unread: true }] }, workspace);
  await host.disconnect(serverKey(entry.id));

  const fresh = setup().host;
  await fresh.connect(entry);
  expect(fresh.find(serverKey(entry.id))?.tabs).toEqual({ activeId: "t", enabled: false, items: [{ id: "t", name: "部署日志" }] });
  expect(fresh.commands(serverKey(entry.id))).toBeUndefined();
  const changed = setup().host;
  await changed.connect({ ...entry, endpoint: b.endpoint });
  expect(changed.find(serverKey(entry.id))?.tabs).toBeUndefined();
});

it("selects the requested remote tab in the first host notification", async () => {
  const { host } = setup();
  const { port, workspace } = await open(host, a);
  port.publish({ activeId: "first", enabled: true, items: [{ id: "first", name: "构建" }, { id: "second", name: "测试" }] }, workspace);
  host.focus("local");
  const observed: (string | undefined)[] = [];
  const stop = host.subscribe(() => observed.push(host.find(host.snapshot().active)?.tabs?.activeId));
  host.focus(serverKey(a.id), "second");
  expect(observed).toEqual(["second"]);
  expect(workspace.select).toHaveBeenLastCalledWith("second");
  stop();
});

it("restores the foreground first, preserves tab order, and lets a click promote a queued server", async () => {
  vi.useFakeTimers();
  try {
    const { transport, host } = setup();
    const c = { id: "c", name: "CI", endpoint: "https://c.test" };
    const restoring = host.restore([a, b, c].map(entry => ({ entry, runtimeId: entry.id })), serverKey("b"));
    expect(transport.connect.mock.calls).toEqual([[b.endpoint, "b"]]);
    expect(host.snapshot().environments.map(env => env.key)).toEqual(["local", "server:a", "server:b", "server:c"]);
    host.focus("server:c");
    expect(transport.connect.mock.calls).toHaveLength(2);
    host.focus("local");
    await vi.runAllTimersAsync(); await restoring;
    expect(transport.connect.mock.calls).toEqual([[b.endpoint, "b"], [c.endpoint, "c"], [a.endpoint, "a"]]);
    expect(host.snapshot().active).toBe("local");
  } finally { vi.useRealTimers(); }
});
