import { beforeEach, expect, it, vi } from "vitest";
import { watchWebPopups } from "./webPopupEvents";
import type { WebPopupEvent } from "../lib/tauri/webPopups";
const ipc = vi.hoisted(() => ({ listen: vi.fn(), close: vi.fn(), reject: vi.fn(async () => {}), unlisten: vi.fn(), unclose: vi.fn() }));
vi.mock("../lib/tauri/webPopups", () => ({ listenWebPopups: ipc.listen, listenWebWindowClose: ipc.close, rejectWebPopup: ipc.reject }));
let receive: (event: WebPopupEvent) => void;
let close: (label: string) => void;
beforeEach(() => {
  vi.clearAllMocks();
  ipc.listen.mockImplementation(async handler => { receive = handler; return ipc.unlisten; });
  ipc.close.mockImplementation(async handler => { close = handler; return ipc.unclose; });
});
const request = { label: "web-source", requestId: "request", url: "https://example.test/", message: null };

it("routes only this generation, suppresses duplicate events and closes only its own tab", async () => {
  const open = vi.fn(), onClose = vi.fn(), error = vi.fn();
  const watcher = watchWebPopups("source", () => ({ onRequest: open, onClose }), error);
  await watcher.ready;
  receive({ ...request, label: "web-other" }); receive(request); receive(request);
  expect(open).toHaveBeenCalledExactlyOnceWith({ label: request.label, requestId: request.requestId, url: request.url });
  close("web-other"); expect(onClose).not.toHaveBeenCalled(); close("web-source"); expect(onClose).toHaveBeenCalledOnce();
  receive({ ...request, requestId: null, message: "已拦截网页自动弹窗" }); expect(error).toHaveBeenCalledWith("已拦截网页自动弹窗");
  watcher.dispose(); close("web-source"); receive({ ...request, requestId: "late" });
  expect(onClose).toHaveBeenCalledOnce(); expect(ipc.reject).toHaveBeenCalledWith("late");
  expect(ipc.unlisten).toHaveBeenCalledOnce(); expect(ipc.unclose).toHaveBeenCalledOnce();
});
it("rejects capacity failures and reports feedback without accepting a native request", async () => {
  const error = vi.fn();
  const watcher = watchWebPopups("source", () => ({ onRequest: () => { throw new Error("标签页已满"); } }), error);
  await watcher.ready; receive(request);
  expect(error).toHaveBeenCalledWith("标签页已满"); expect(ipc.reject).toHaveBeenCalledExactlyOnceWith("request"); watcher.dispose();
});
it("releases late listeners and partial setup when a subscription fails", async () => {
  let finish!: (unlisten: () => void) => void;
  ipc.listen.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  ipc.close.mockRejectedValue(new Error("listener failed"));
  const watcher = watchWebPopups("source", () => ({}), vi.fn());
  await expect(watcher.ready).rejects.toThrow("listener failed");
  finish(ipc.unlisten); await Promise.resolve();
  expect(ipc.unlisten).toHaveBeenCalledOnce(); watcher.dispose(); expect(ipc.unlisten).toHaveBeenCalledOnce();
});
