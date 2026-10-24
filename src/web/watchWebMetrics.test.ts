import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { watchWebMetrics } from "./watchWebMetrics";
import type { WebMetrics } from "../lib/tauri/web";

const read = vi.hoisted(() => vi.fn());
vi.mock("../lib/tauri/web", () => ({ readWebMetrics: read }));
const metric: WebMetrics = { url: "https://host/", documentId: 10, resources: 3, loadMs: 1200 };
beforeEach(() => { vi.useFakeTimers(); read.mockReset(); });
afterEach(() => vi.useRealTimers());

it("pauses hidden views and serializes requests while preserving document totals", async () => {
  let visible = false;
  const receive = vi.fn();
  read.mockResolvedValue(metric);
  const watcher = watchWebMetrics("id", () => visible, receive);
  await vi.advanceTimersByTimeAsync(1500);
  expect(read).not.toHaveBeenCalled();
  visible = true;
  await vi.advanceTimersByTimeAsync(750);
  expect(receive).toHaveBeenCalledWith(metric);
  watcher.dispose();
  await vi.advanceTimersByTimeAsync(1500);
  expect(read).toHaveBeenCalledOnce();
});

it("drops in-flight and old-document results after navigation, including same-URL reloads", async () => {
  read.mockResolvedValue(metric);
  const receive = vi.fn();
  const watcher = watchWebMetrics("id", () => true, receive);
  await vi.advanceTimersByTimeAsync(0);
  let finish!: (value: WebMetrics) => void;
  read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(750);
  watcher.reset();
  finish({ ...metric, resources: 90 });
  await vi.advanceTimersByTimeAsync(750);
  expect(receive).toHaveBeenLastCalledWith(null);
  read.mockResolvedValue({ ...metric, documentId: 20, resources: 1 });
  await vi.advanceTimersByTimeAsync(750);
  expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ documentId: 20, resources: 1 }));
  watcher.dispose();
});

it("does not turn sampling failures into page errors and ignores results after disposal", async () => {
  read.mockRejectedValue(new Error("timeout"));
  const receive = vi.fn();
  const watcher = watchWebMetrics("id", () => true, receive);
  await vi.advanceTimersByTimeAsync(0);
  expect(receive).toHaveBeenCalledWith(null);
  let finish!: (value: WebMetrics) => void;
  read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(750);
  watcher.dispose();
  receive.mockClear();
  finish(metric);
  await vi.advanceTimersByTimeAsync(1500);
  expect(receive).not.toHaveBeenCalled();
});
