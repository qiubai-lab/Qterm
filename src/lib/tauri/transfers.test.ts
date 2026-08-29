import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  handlers: [] as Array<(event: unknown) => void>,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  Channel: class {
    constructor(handler: (event: unknown) => void) {
      mocks.handlers.push(handler);
    }
  },
}));

import {
  cancelTransfer,
  downloadDirectory,
  downloadFile,
  selectDownloadDirectory,
  selectDownloadPath,
  selectUploadFiles,
  selectUploadFolder,
  selectUploadFile,
  uploadSelectedEntries,
  uploadFile,
  uploadDroppedEntries,
} from "./transfers";

describe("SFTP IPC client", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.handlers.length = 0;
  });

  it("uses system-selected paths and ordered transfer events", async () => {
    mocks.invoke
      .mockResolvedValueOnce("/tmp/local.txt")
      .mockResolvedValueOnce("/tmp/download.txt")
      .mockResolvedValueOnce("transfer-1");
    expect(await selectUploadFile()).toBe("/tmp/local.txt");
    expect(await selectDownloadPath()).toBe("/tmp/download.txt");
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "transfer_select_download_path", { name: null });
    const onEvent = vi.fn();
    await uploadFile("session-1", "/tmp/local.txt", "/srv/local.txt", onEvent);

    expect(mocks.invoke).toHaveBeenLastCalledWith("transfer_upload", {
      input: {
        sessionId: "session-1",
        localPath: "/tmp/local.txt",
        remotePath: "/srv/local.txt",
      },
      onEvent: expect.any(Object),
    });
    mocks.handlers[0]?.({ type: "progress", transferredBytes: 4, totalBytes: 8 });
    expect(onEvent).toHaveBeenCalledWith({
      type: "progress",
      transferredBytes: 4,
      totalBytes: 8,
    });
  });

  it("exposes download and cancel commands", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await downloadFile(
      "session-1",
      "/srv/a.txt",
      "/tmp/a.txt",
      vi.fn(),
    );
    await cancelTransfer("session-1", "transfer-1");

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "transfer_download", {
      input: {
        sessionId: "session-1",
        remotePath: "/srv/a.txt",
        localPath: "/tmp/a.txt",
        isDirectory: false,
      },
      onEvent: expect.any(Object),
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "transfer_cancel", {
      sessionId: "session-1",
      transferId: "transfer-1",
    });
  });

  it("selects and downloads a directory with an explicit directory flag", async () => {
    mocks.invoke.mockResolvedValueOnce("/tmp/release").mockResolvedValueOnce("transfer-2");
    expect(await selectDownloadDirectory("release")).toBe("/tmp/release");
    await downloadDirectory("session-1", "/srv/release", "/tmp/release", vi.fn());

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "transfer_select_download_directory", { name: "release" });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "transfer_download", {
      input: { sessionId: "session-1", remotePath: "/srv/release", localPath: "/tmp/release", isDirectory: true },
      onEvent: expect.any(Object),
    });
  });

  it("uploads one native drop as a grouped transfer", async () => {
    mocks.invoke.mockResolvedValue("transfer-drop");
    await uploadDroppedEntries("session-1", ["/tmp/a.txt", "/tmp/folder"], "/srv", vi.fn());
    expect(mocks.invoke).toHaveBeenCalledWith("transfer_upload_dropped", {
      input: { sessionId: "session-1", localPaths: ["/tmp/a.txt", "/tmp/folder"], remoteDirectory: "/srv" },
      onEvent: expect.any(Object),
    });
  });

  it("selects files or a folder and uploads the selected entries as one transfer", async () => {
    mocks.invoke
      .mockResolvedValueOnce(["/tmp/a.txt", "/tmp/b.txt"])
      .mockResolvedValueOnce("/tmp/folder")
      .mockResolvedValueOnce("transfer-selected");

    expect(await selectUploadFiles()).toEqual(["/tmp/a.txt", "/tmp/b.txt"]);
    expect(await selectUploadFolder()).toBe("/tmp/folder");
    const onEvent = vi.fn();
    await uploadSelectedEntries("session-1", ["/tmp/a.txt", "/tmp/b.txt"], "/srv", onEvent);

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "transfer_select_upload_files");
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "transfer_select_upload_folder");
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, "transfer_upload_selected", {
      input: { sessionId: "session-1", localPaths: ["/tmp/a.txt", "/tmp/b.txt"], remoteDirectory: "/srv" },
      onEvent: expect.any(Object),
    });
    mocks.handlers[0]?.({ type: "completed" });
    expect(onEvent).toHaveBeenCalledWith({ type: "completed" });
  });
});
