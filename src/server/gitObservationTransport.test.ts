import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitSnapshot } from "../lib/tauri/git";
import { pauseData, resumeData } from "./dataAccess";
import { createGitObservationTransport } from "./gitObservationTransport";
import { api } from "./http";
vi.mock("./http", async importOriginal => ({ ...await importOriginal<typeof import("./http")>(), api: vi.fn() }));
vi.mock("./accessIdentity", () => ({ accessProof: () => ({ accessKey: "test-key", clientId: "test-client" }) }));
class Socket {
  static OPEN = 1;
  static all: Socket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: (event: { data: string }) => void;
  constructor(readonly url: URL) { Socket.all.push(this); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  emit(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
  change(revision: number) { this.emit({ type: "repositoryChanged", id: this.sent.find(v => v.type === "subscribe")?.id, revision }); }
}
const target = { kind: "local" as const, path: "/repo" };
const snapshot = { repositoryPath: "/repo" } as GitSnapshot;
const cleanups: (() => void)[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); Socket.all = []; vi.stubGlobal("WebSocket", Socket); resumeData(); });
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Git invalidation transport", () => {
  it("shares subscriptions and lazy HTTP reads, rejects duplicate revisions, and stops after the last pane", async () => {
    vi.mocked(api).mockResolvedValue(snapshot);
    const transport = createGitObservationTransport(), first = vi.fn(), second = vi.fn();
    const stop = transport.subscribe(target, first); cleanups.push(stop);
    const socket = Socket.all[0]; socket.open(); socket.change(2); socket.change(1); socket.change(2);
    cleanups.push(transport.subscribe(target, second));
    expect(socket.sent.filter(v => v.type === "subscribe")).toHaveLength(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalled();
    expect(await first.mock.calls[0][0]()).toEqual(snapshot);
    expect(await second.mock.calls[0][0]()).toEqual(snapshot);
    expect(api).toHaveBeenCalledTimes(1);
    stop(); expect(socket.readyState).toBe(1);
    cleanups.pop()?.(); expect(socket.readyState).toBe(3);
    await expect(second.mock.calls[0][0]()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(60000); expect(Socket.all).toHaveLength(1);
  });
  it("cancels stale reads and reconnect timers at lock, then accepts a fresh lower revision", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api).mockImplementation(() => new Promise(done => { resolve = done; }));
    const listener = vi.fn(), transport = createGitObservationTransport();
    cleanups.push(transport.subscribe(target, listener));
    const socket = Socket.all[0]; socket.open(); socket.change(10);
    const read = listener.mock.calls[0][0]();
    const rejected = expect(read).rejects.toThrow();
    pauseData(); resolve(snapshot); await rejected;
    socket.change(11); expect(listener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000); expect(Socket.all).toHaveLength(1);
    resumeData(); const next = Socket.all[1]; next.open(); next.change(1);
    expect(listener).toHaveBeenCalledTimes(2);
    next.close(); pauseData(); await vi.advanceTimersByTimeAsync(5000);
    expect(Socket.all).toHaveLength(2);
  });
  it("reconnects after failure and isolates a rejected repository from other subscriptions", async () => {
    const transport = createGitObservationTransport(), first = vi.fn(), second = vi.fn();
    cleanups.push(transport.subscribe(target, first), transport.subscribe({ ...target, path: "/other" }, second));
    const socket = Socket.all[0]; socket.open();
    socket.emit({ type: "subscriptionError", id: socket.sent[1].id, error: { code: "invalidRequest", message: "missing" } });
    await expect(first.mock.calls[0][0]()).rejects.toThrow("missing");
    expect(second).not.toHaveBeenCalled(); expect(socket.readyState).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(socket.sent.filter(v => v.type === "subscribe")).toHaveLength(3);
    socket.close(); await vi.advanceTimersByTimeAsync(1000);
    const next = Socket.all[1]; next.open(); next.change(1);
    expect(first).toHaveBeenCalledTimes(3);
    expect(next.sent.filter(v => v.type === "subscribe")).toHaveLength(2);
  });
});
