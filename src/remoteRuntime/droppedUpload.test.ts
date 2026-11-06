import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { uploadRequest } from "../server/uploadRequest";
import { uploadRemoteDrop } from "./droppedUpload";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../server/uploadRequest", () => ({ uploadRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("reads the accepted native drop once and uploads relative entries to the receiving directory", async () => {
  vi.mocked(invoke).mockResolvedValue([
    { path: "资料/empty", data: null },
    { path: "资料/a.bin", data: "AP+A" },
    { path: "资料/zero", data: "" },
  ]);
  const onEvent = vi.fn();
  await uploadRemoteDrop("session", ["C:/资料"], "/data/home", onEvent);
  await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith({ type: "completed" }));
  expect(invoke).toHaveBeenCalledExactlyOnceWith("remote_runtime_drop", { paths: ["C:/资料"] });
  const uploads = vi.mocked(uploadRequest).mock.calls;
  expect(uploads.map(([url]) => {
    const query = new URL(url, "http://localhost").searchParams;
    return [query.get("sessionId"), query.get("path"), query.get("relativePath"), query.has("directory")];
  })).toEqual([
    ["session", "/data/home", "资料/empty", true],
    ["session", "/data/home", "资料/a.bin", false],
    ["session", "/data/home", "资料/zero", false],
  ]);
  const file = uploads[1][1].get("file") as File;
  const reader = new FileReader();
  const bytes = new Promise<ArrayBuffer>(resolve => { reader.onload = () => resolve(reader.result as ArrayBuffer); });
  reader.readAsArrayBuffer(file);
  expect(Array.from(new Uint8Array(await bytes))).toEqual([0, 255, 128]);
});

it("reports the native read error without starting an upload", async () => {
  vi.mocked(invoke).mockRejectedValue("文件拖放授权已失效，请重新拖入");
  await expect(uploadRemoteDrop("session", ["C:/file"], "/dest", vi.fn())).rejects.toThrow("文件拖放授权已失效");
  expect(uploadRequest).not.toHaveBeenCalled();
});
