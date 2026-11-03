import { beforeEach, expect, it, vi } from "vitest";
import { streamNativeDownload } from "./download";
const ipc = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({invoke:ipc}));
beforeEach(() => { ipc.mockReset(); ipc.mockResolvedValue(undefined); });
it("writes bounded chunks with progress before committing, without buffering the response", async () => {
  const response = new Response(new Uint8Array(160000), {headers:{"content-length":"160000"}});
  const buffer = vi.spyOn(response, "arrayBuffer");
  const progress = vi.fn();
  await streamNativeDownload(response, "destination", new AbortController().signal, progress);
  const writes = ipc.mock.calls.filter(([name]) => name === "remote_download_write");
  expect(writes.map(([,bytes]) => bytes.length)).toEqual([65536,65536,28928]);
  expect(progress).toHaveBeenLastCalledWith(160000,160000);
  expect(ipc).toHaveBeenLastCalledWith("remote_download_finish", {id:"destination"});
  expect(buffer).not.toHaveBeenCalled();
});
it("cancellation during a native write prevents commit and deletes the partial sink", async () => {
  const controller = new AbortController();
  ipc.mockImplementation(async name => { if (name === "remote_download_write") controller.abort(); });
  await expect(streamNativeDownload(new Response(new Uint8Array(80000)), "destination", controller.signal, vi.fn())).rejects.toThrow();
  expect(ipc).toHaveBeenCalledWith("remote_download_cancel", {id:"destination"});
  expect(ipc.mock.calls.some(([name]) => name === "remote_download_finish")).toBe(false);
});
it("rejects truncated responses and preserves the existing destination", async () => {
  await expect(streamNativeDownload(new Response("short", {headers:{"content-length":"100"}}), "destination", new AbortController().signal, vi.fn())).rejects.toThrow("文件不完整");
  expect(ipc).toHaveBeenCalledWith("remote_download_cancel", {id:"destination"});
  expect(ipc.mock.calls.some(([name]) => name === "remote_download_finish")).toBe(false);
});
it("cancels a stalled response reader immediately", async () => {
  const controller = new AbortController(); const cancel = vi.fn();
  const result = streamNativeDownload(new Response(new ReadableStream({cancel})), "destination", controller.signal, vi.fn());
  controller.abort();
  await expect(result).rejects.toThrow();
  expect(cancel).toHaveBeenCalled();
});
