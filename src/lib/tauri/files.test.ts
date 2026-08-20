import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  Channel: class { constructor(handler: (event: unknown) => void) { void handler; } },
}));

import { copyFile, createEntry, deleteEntry, listLocalRoots, readBinaryFile, readTextFile, renameEntry, writeTextFile } from "./files";

describe("file content IPC client", () => {
  beforeEach(() => mocks.invoke.mockReset());

  it("keeps local and remote file access behind one narrow contract", async () => {
    mocks.invoke.mockResolvedValue({ content: "hello", revision: "r1", modifiedAt: null, size: 5 });
    await readTextFile(null, "C:/work/a.txt");
    await writeTextFile("session-1", "/srv/a.txt", "updated", "r1");

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "files_read_text", { input: { sessionId: null, path: "C:/work/a.txt" } });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "files_write_text", { input: { sessionId: "session-1", path: "/srv/a.txt", content: "updated", expectedRevision: "r1" } });
  });

  it("requests binary data through the raw response command", async () => {
    const bytes = new ArrayBuffer(3);
    mocks.invoke.mockResolvedValue(bytes);
    expect(await readBinaryFile("session-1", "/srv/photo.jpg")).toBe(bytes);
    expect(mocks.invoke).toHaveBeenCalledWith("files_read_binary", { input: { sessionId: "session-1", path: "/srv/photo.jpg" } });
  });

  it("keeps copy rename and delete behind explicit mutation commands", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await copyFile("session-1", "/srv/a.txt", "a-copy.txt");
    await renameEntry(null, "C:/work/a.txt", "renamed.txt");
    await deleteEntry("session-1", "/srv/old.txt");

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "files_copy_entry", { input: { sessionId: "session-1", path: "/srv/a.txt", targetName: "a-copy.txt" } });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "files_rename_entry", { input: { sessionId: null, path: "C:/work/a.txt", targetName: "renamed.txt" } });
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, "files_delete_entry", { input: { sessionId: "session-1", path: "/srv/old.txt" } });
  });

  it("creates files and folders through one typed command", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await createEntry("session-1", "/srv", "notes.txt", false);
    await createEntry(null, "C:/work", "assets", true);
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "files_create_entry", { input: { sessionId: "session-1", directory: "/srv", name: "notes.txt", isDirectory: false } });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "files_create_entry", { input: { sessionId: null, directory: "C:/work", name: "assets", isDirectory: true } });
  });

  it("lists local filesystem roots through a read-only command", async () => {
    const roots = [{ name: "C:", path: "C:\\" }];
    mocks.invoke.mockResolvedValue(roots);

    await expect(listLocalRoots()).resolves.toEqual(roots);
    expect(mocks.invoke).toHaveBeenCalledWith("files_list_local_roots");
  });
});
