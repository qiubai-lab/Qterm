import { afterEach, expect, it, vi } from "vitest";
import { uploadRequest } from "../server/uploadRequest";
import { uploadRemoteDrop } from "./droppedUpload";

const { prepare, release } = vi.hoisted(() => ({ prepare: vi.fn(), release: vi.fn() }));
vi.mock("./desktop/frame", () => ({ framePort: { fileDrop: { prepare, release } } }));
vi.mock("../server/uploadRequest", () => ({ uploadRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("reads the accepted native drop once and uploads relative entries to the receiving directory", async () => {
  prepare.mockResolvedValue({ id: "batch", entries: [
    { path: "资料/empty", size: 0, token: null },
    { path: "资料/a.bin", size: 200 * 1024 ** 2, token: "batch/1" },
    { path: "资料/zero", size: 0, token: "batch/2" },
  ] });
  const onEvent = vi.fn();
  await uploadRemoteDrop("session", ["C:/资料"], "/data/home", onEvent);
  await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith({ type: "completed" }));
  expect(prepare).toHaveBeenCalledExactlyOnceWith(["C:/资料"]);
  const uploads = vi.mocked(uploadRequest).mock.calls;
  expect(uploads.map(([url]) => {
    const query = new URL(url, "http://localhost").searchParams;
    return [query.get("sessionId"), query.get("path"), query.get("relativePath"), query.has("directory")];
  })).toEqual([
    ["session", "/data/home", "资料/empty", true],
    ["session", "/data/home", "资料/a.bin", false],
    ["session", "/data/home", "资料/zero", false],
  ]);
  expect(uploads[1][3]).toBe(200 * 1024 ** 2);
  expect(uploads[0][1]).toBeInstanceOf(FormData);
  expect(uploads[1][1]).toMatchObject({ token: "batch/1" });
  expect(uploads[2][1]).toMatchObject({ token: "batch/2", size: 0 });
  expect(release).toHaveBeenCalledExactlyOnceWith("batch");
});

it("reports the native read error without starting an upload", async () => {
  prepare.mockRejectedValue("文件拖放授权已失效，请重新拖入");
  await expect(uploadRemoteDrop("session", ["C:/file"], "/dest", vi.fn())).rejects.toThrow("文件拖放授权已失效");
  expect(uploadRequest).not.toHaveBeenCalled();
});
