import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TransferEvent } from "../lib/tauri/transfers";

const { listLocalDirectory, listLocalRoots, listRemoteDirectory, readTextFile, readBinaryFile, writeTextFile, writeClipboardText, copyFile, createEntry, renameEntry, deleteEntry, selectDownloadDirectory, selectDownloadPath, downloadDirectory, downloadFile, uploadDroppedEntries, cancelTransfer, dragDrop } = vi.hoisted(() => ({
  listLocalDirectory: vi.fn(),
  listLocalRoots: vi.fn(),
  listRemoteDirectory: vi.fn(),
  readTextFile: vi.fn(),
  readBinaryFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeClipboardText: vi.fn(),
  copyFile: vi.fn(),
  createEntry: vi.fn(),
  renameEntry: vi.fn(),
  deleteEntry: vi.fn(),
  selectDownloadDirectory: vi.fn(),
  selectDownloadPath: vi.fn(),
  downloadDirectory: vi.fn(),
  downloadFile: vi.fn(),
  uploadDroppedEntries: vi.fn(),
  cancelTransfer: vi.fn(),
  dragDrop: { handler: null as null | ((event: { payload: Record<string, unknown> }) => void) },
}));

vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ onDragDropEvent: vi.fn(async (handler) => { dragDrop.handler = handler; return () => { dragDrop.handler = null; }; }) }) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: writeClipboardText }));
vi.mock("../lib/tauri/files", () => ({ listLocalDirectory, listLocalRoots, listRemoteDirectory, readTextFile, readBinaryFile, writeTextFile, copyFile, createEntry, renameEntry, deleteEntry }));
vi.mock("../lib/tauri/transfers", () => ({ selectDownloadDirectory, selectDownloadPath, downloadDirectory, downloadFile, uploadDroppedEntries, cancelTransfer }));
vi.mock("./CodeEditor", () => ({ CodeEditor: ({ value, readOnly, onChange, onSave }: { value: string; readOnly?: boolean; onChange: (value: string) => void; onSave: () => void }) => <textarea aria-label={readOnly ? "文件只读预览" : "文件编辑器"} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (!readOnly && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); onSave(); } }}/>}));
vi.mock("./MarkdownPreview", () => ({ MarkdownPreview: ({ content }: { content: string }) => <h1>{content.replace(/^#\s*/, "")}</h1> }));

import { FileBrowserPane } from "./FileBrowserPane";
import { displayLocalPath, isWindowsDriveRoot, parentPath } from "./path";

const localRuntime = { sessionId: null, kind: "local" as const, status: "connected" as const, hostKeyPrompt: null, notice: "", connectionProgress: null };

describe("FileBrowserPane", () => {
  beforeEach(() => {
    listLocalDirectory.mockReset();
    listLocalRoots.mockReset();
    listRemoteDirectory.mockReset();
    readTextFile.mockReset(); readBinaryFile.mockReset(); writeTextFile.mockReset(); writeClipboardText.mockReset(); copyFile.mockReset(); createEntry.mockReset(); renameEntry.mockReset(); deleteEntry.mockReset();
    selectDownloadDirectory.mockReset(); selectDownloadPath.mockReset(); downloadDirectory.mockReset(); downloadFile.mockReset(); uploadDroppedEntries.mockReset(); cancelTransfer.mockReset();
    dragDrop.handler = null;
  });

  it("lists a local directory and opens child folders", async () => {
    listLocalDirectory
      .mockResolvedValueOnce({ path: "C:/work", entries: [{ name: "src", path: "C:/work/src", isDirectory: true, size: 0, modifiedAt: null }] })
      .mockResolvedValueOnce({ path: "C:/work/src", entries: [] });
    const onPathChange = vi.fn();
    render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={onPathChange}/>);
    const folder = await screen.findByRole("listitem", { name: /src/ });
    expect(folder).toHaveAttribute("data-entry-kind", "directory");
    fireEvent.doubleClick(folder);
    await waitFor(() => expect(listLocalDirectory).toHaveBeenLastCalledWith("C:/work/src"));
    expect(onPathChange).toHaveBeenLastCalledWith("C:/work/src");
  });

  it("restores directory browsing positions while navigating up and forward", async () => {
    const parentEntries = [{ name: "src", path: "/home/dev/src", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null, permissionMode: 0o755 }];
    const childEntries = [{ name: "index.ts", path: "/home/dev/src/index.ts", isDirectory: false, isSymlink: false, size: 12, modifiedAt: null, permissionMode: 0o644 }];
    listRemoteDirectory
      .mockResolvedValueOnce({ path: "/home/dev", entries: parentEntries })
      .mockResolvedValueOnce({ path: "/home/dev/src", entries: childEntries })
      .mockResolvedValueOnce({ path: "/home/dev", entries: parentEntries })
      .mockResolvedValueOnce({ path: "/home/dev/src", entries: childEntries });
    function ControlledPane() {
      const [controlledPath, setControlledPath] = useState("/home/dev");
      return <FileBrowserPane initialPath={controlledPath} runtime={{ ...localRuntime, kind: "sftp", sessionId: "files-1" }} onPathChange={setControlledPath}/>;
    }
    const view = render(<ControlledPane/>);
    const ui = within(view.container);
    const content = view.container.querySelector<HTMLElement>(".file-browser-content")!;
    const forward = ui.getByRole("button", { name: "前进到下一目录" });

    const folder = await ui.findByRole("listitem", { name: /src/ });
    expect(forward).toBeDisabled();
    content.scrollTop = 160;
    fireEvent.click(folder);
    fireEvent.doubleClick(folder);
    await waitFor(() => expect(listRemoteDirectory).toHaveBeenLastCalledWith("files-1", "/home/dev/src"));
    await waitFor(() => expect(content.scrollTop).toBe(0));
    content.scrollTop = 45;

    fireEvent.click(ui.getByRole("button", { name: "返回上级文件夹" }));
    await waitFor(() => expect(listRemoteDirectory).toHaveBeenLastCalledWith("files-1", "/home/dev"));
    await ui.findByRole("listitem", { name: /src/ });
    await waitFor(() => expect(content.scrollTop).toBe(160));
    expect(ui.getByRole("listitem", { name: /src/ })).toHaveAttribute("data-selected", "true");
    expect(forward).toBeEnabled();

    fireEvent.click(forward);
    await waitFor(() => expect(listRemoteDirectory).toHaveBeenLastCalledWith("files-1", "/home/dev/src"));
    await ui.findByRole("listitem", { name: /index\.ts/ });
    await waitFor(() => expect(content.scrollTop).toBe(45));
    expect(forward).toBeDisabled();
    expect(listRemoteDirectory).toHaveBeenCalledTimes(4);
  });

  it("keeps the visible row anchored when entries are inserted above it", async () => {
    const initialEntries = ["alpha", "beta", "gamma"].map((name) => ({ name, path: `/home/dev/${name}`, isDirectory: true, isSymlink: false, size: 0, modifiedAt: null, permissionMode: 0o755 }));
    const updatedEntries = [
      { name: "added", path: "/home/dev/added", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null, permissionMode: 0o755 },
      ...initialEntries,
    ];
    listRemoteDirectory
      .mockResolvedValueOnce({ path: "/home/dev", entries: initialEntries })
      .mockResolvedValueOnce({ path: "/home/dev/beta", entries: [] })
      .mockResolvedValueOnce({ path: "/home/dev", entries: updatedEntries });
    const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("file-browser-columns")) return testRect(0, 25);
      if (this.classList.contains("file-row")) {
        const rows = Array.from(this.parentElement?.querySelectorAll(".file-row") ?? []);
        const index = rows.indexOf(this);
        const scrollTop = this.closest<HTMLElement>(".file-browser-content")?.scrollTop ?? 0;
        const top = 28 + index * 27 - scrollTop;
        return testRect(top, top + 27);
      }
      return testRect(0, 200);
    });

    try {
      const view = render(<FileBrowserPane initialPath="/home/dev" runtime={{ ...localRuntime, kind: "sftp", sessionId: "files-1" }} onPathChange={vi.fn()}/>);
      const ui = within(view.container);
      const content = view.container.querySelector<HTMLElement>(".file-browser-content")!;
      const beta = await ui.findByRole("listitem", { name: /beta/ });
      content.scrollTop = 35;

      fireEvent.doubleClick(beta);
      await waitFor(() => expect(listRemoteDirectory).toHaveBeenLastCalledWith("files-1", "/home/dev/beta"));
      fireEvent.click(ui.getByRole("button", { name: "返回上级文件夹" }));

      await ui.findByRole("listitem", { name: /added/ });
      await waitFor(() => expect(content.scrollTop).toBe(62));
      const restoredBeta = ui.getByRole("listitem", { name: /beta/ });
      expect(restoredBeta.getBoundingClientRect().top - 25).toBe(-5);
    } finally {
      geometry.mockRestore();
    }
  });

  it("bounds mounted rows and restores a path anchor in a large directory", async () => {
    const entries = Array.from({ length: 1000 }, (_, index) => ({
      name: `item-${index.toString().padStart(4, "0")}`,
      path: `/home/dev/item-${index.toString().padStart(4, "0")}`,
      isDirectory: true,
      isSymlink: false,
      size: 0,
      modifiedAt: null,
      permissionMode: 0o755,
    }));
    const updatedEntries = [
      { name: "added", path: "/home/dev/added", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null, permissionMode: 0o755 },
      ...entries,
    ];
    listRemoteDirectory
      .mockResolvedValueOnce({ path: "/home/dev", entries })
      .mockResolvedValueOnce({ path: "/home/dev/item-0500", entries: [] })
      .mockResolvedValueOnce({ path: "/home/dev", entries: updatedEntries });
    const view = render(<FileBrowserPane initialPath="/home/dev" runtime={{ ...localRuntime, kind: "sftp", sessionId: "files-1" }} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const first = await ui.findByRole("listitem", { name: /item-0000/ });
    const content = view.container.querySelector<HTMLElement>(".file-browser-content")!;
    Object.defineProperty(content, "clientHeight", { configurable: true, value: 270 });

    expect(view.container.querySelectorAll(".file-row").length).toBeLessThan(80);
    const anchorScrollTop = 3 + 500 * 27;
    content.scrollTop = anchorScrollTop;
    fireEvent.scroll(content);
    await waitFor(() => expect(view.container.querySelector('[data-entry-path="/home/dev/item-0500"]')).toBeInTheDocument());
    expect(first).not.toBeInTheDocument();

    fireEvent.doubleClick(view.container.querySelector('[data-entry-path="/home/dev/item-0500"]')!);
    await waitFor(() => expect(listRemoteDirectory).toHaveBeenLastCalledWith("files-1", "/home/dev/item-0500"));
    fireEvent.click(ui.getByRole("button", { name: "返回上级文件夹" }));

    await waitFor(() => expect(content.scrollTop).toBe(anchorScrollTop + 27));
    await waitFor(() => expect(view.container.querySelector('[data-entry-path="/home/dev/item-0500"]')).toBeInTheDocument());
    expect(view.container.querySelectorAll(".file-row").length).toBeLessThan(80);
  });

  it("clears the forward branch after opening a different directory", async () => {
    const parentEntries = [
      { name: "alpha", path: "/home/dev/alpha", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null, permissionMode: 0o755 },
      { name: "beta", path: "/home/dev/beta", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null, permissionMode: 0o755 },
    ];
    listRemoteDirectory
      .mockResolvedValueOnce({ path: "/home/dev", entries: parentEntries })
      .mockResolvedValueOnce({ path: "/home/dev/alpha", entries: [] })
      .mockResolvedValueOnce({ path: "/home/dev", entries: parentEntries })
      .mockResolvedValueOnce({ path: "/home/dev/beta", entries: [] });
    const view = render(<FileBrowserPane initialPath="/home/dev" runtime={{ ...localRuntime, kind: "sftp", sessionId: "files-1" }} onPathChange={vi.fn()}/>);
    const ui = within(view.container);

    fireEvent.doubleClick(await ui.findByRole("listitem", { name: /alpha/ }));
    await waitFor(() => expect(listRemoteDirectory).toHaveBeenLastCalledWith("files-1", "/home/dev/alpha"));
    fireEvent.click(ui.getByRole("button", { name: "返回上级文件夹" }));
    const beta = await ui.findByRole("listitem", { name: /beta/ });
    expect(ui.getByRole("button", { name: "前进到下一目录" })).toBeEnabled();

    fireEvent.doubleClick(beta);
    await waitFor(() => expect(listRemoteDirectory).toHaveBeenLastCalledWith("files-1", "/home/dev/beta"));
    expect(ui.getByRole("button", { name: "前进到下一目录" })).toBeDisabled();
  });

  it("preserves the current browsing position when refreshing a directory", async () => {
    const entries = [{ name: "src", path: "/home/dev/src", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null, permissionMode: 0o755 }];
    listRemoteDirectory
      .mockResolvedValueOnce({ path: "/home/dev", entries })
      .mockResolvedValueOnce({ path: "/home/dev", entries });
    const view = render(<FileBrowserPane initialPath="/home/dev" runtime={{ ...localRuntime, kind: "sftp", sessionId: "files-1" }} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const content = view.container.querySelector<HTMLElement>(".file-browser-content")!;
    const folder = await ui.findByRole("listitem", { name: /src/ });

    content.scrollTop = 120;
    fireEvent.click(folder);
    fireEvent.click(ui.getByRole("button", { name: "刷新文件夹" }));

    await waitFor(() => expect(listRemoteDirectory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(content.scrollTop).toBe(120));
    expect(ui.getByRole("listitem", { name: /src/ })).toHaveAttribute("data-selected", "true");
  });

  it("lists a local directory without creating a terminal session", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [] });
    render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    await waitFor(() => expect(listLocalDirectory).toHaveBeenCalledWith("C:/work"));
    expect(listRemoteDirectory).not.toHaveBeenCalled();
  });

  it("shows drive roots as ordinary folder rows and switches drives", async () => {
    listLocalDirectory
      .mockResolvedValueOnce({ path: "D:\\", entries: [] })
      .mockResolvedValueOnce({ path: "C:\\", entries: [] });
    listLocalRoots.mockResolvedValue([{ name: "C:", path: "C:\\" }, { name: "D:", path: "D:\\" }]);
    const onPathChange = vi.fn();
    const view = render(<FileBrowserPane initialPath={"D:\\"} runtime={localRuntime} onPathChange={onPathChange}/>);
    const ui = within(view.container);

    await waitFor(() => expect(listLocalDirectory).toHaveBeenCalledWith("D:\\"));
    fireEvent.click(ui.getByRole("button", { name: "返回上级文件夹" }));
    const roots = await ui.findByRole("list", { name: "本机根目录" });
    expect(ui.queryByRole("button", { name: "浏览本机位置" })).not.toBeInTheDocument();
    expect(ui.getByRole("button", { name: /^名称，/ })).toBeInTheDocument();
    const drive = within(roots).getByRole("listitem", { name: /C:/ });
    expect(drive).toHaveClass("file-row");
    expect(drive.querySelector('[data-icon="files"]')).toBeInTheDocument();

    fireEvent.click(drive);
    expect(listLocalDirectory).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(drive);
    await waitFor(() => expect(listLocalDirectory).toHaveBeenLastCalledWith("C:\\"));
    expect(onPathChange).toHaveBeenLastCalledWith("C:\\");
  });

  it("shows a readable Windows path while retaining the operational path", async () => {
    const operationalPath = "\\\\?\\D:\\GIT";
    listLocalDirectory.mockResolvedValue({ path: operationalPath, entries: [] });
    const view = render(<FileBrowserPane initialPath={operationalPath} runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);

    expect(await ui.findByRole("button", { name: "D:\\GIT" })).toBeInTheDocument();
    await waitFor(() => expect(listLocalDirectory).toHaveBeenCalledWith(operationalPath));
  });

  it("cycles file-name sorting through ascending, descending, and the original order", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [
      { name: "zeta10.txt", path: "C:/work/zeta10.txt", isDirectory: false, isSymlink: false, size: 3, modifiedAt: 200 },
      { name: "alpha.txt", path: "C:/work/alpha.txt", isDirectory: false, isSymlink: false, size: 20, modifiedAt: null },
      { name: "Beta", path: "C:/work/Beta", isDirectory: true, isSymlink: false, size: 0, modifiedAt: 100 },
      { name: "zeta2.txt", path: "C:/work/zeta2.txt", isDirectory: false, isSymlink: false, size: 10, modifiedAt: 300 },
    ] });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const list = await ui.findByRole("list", { name: /文件夹/ });
    const names = () => within(list).getAllByRole("listitem").map((row) => row.querySelector(".file-name>span")?.textContent);
    const nameHeader = ui.getByRole("button", { name: /^名称，/ });

    expect(names()).toEqual(["zeta10.txt", "alpha.txt", "Beta", "zeta2.txt"]);
    fireEvent.click(nameHeader);
    expect(names()).toEqual(["Beta", "alpha.txt", "zeta2.txt", "zeta10.txt"]);
    expect(nameHeader).toHaveAttribute("data-sort-direction", "ascending");
    fireEvent.click(nameHeader);
    expect(names()).toEqual(["Beta", "zeta10.txt", "zeta2.txt", "alpha.txt"]);
    expect(nameHeader).toHaveAttribute("data-sort-direction", "descending");
    fireEvent.click(nameHeader);
    expect(names()).toEqual(["zeta10.txt", "alpha.txt", "Beta", "zeta2.txt"]);
    expect(nameHeader).not.toHaveAttribute("data-sort-direction");
  });

  it("sorts by size and modified time while keeping folders first and unknown times last", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [
      { name: "unknown.txt", path: "C:/work/unknown.txt", isDirectory: false, isSymlink: false, size: 20, modifiedAt: null },
      { name: "older.txt", path: "C:/work/older.txt", isDirectory: false, isSymlink: false, size: 3, modifiedAt: 100 },
      { name: "assets", path: "C:/work/assets", isDirectory: true, isSymlink: false, size: 0, modifiedAt: 50 },
      { name: "newer.txt", path: "C:/work/newer.txt", isDirectory: false, isSymlink: false, size: 10, modifiedAt: 300 },
    ] });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const list = await ui.findByRole("list", { name: /文件夹/ });
    const names = () => within(list).getAllByRole("listitem").map((row) => row.querySelector(".file-name>span")?.textContent);

    fireEvent.click(ui.getByRole("button", { name: /^大小，/ }));
    expect(names()).toEqual(["assets", "older.txt", "newer.txt", "unknown.txt"]);
    const timeHeader = ui.getByRole("button", { name: /^修改时间，/ });
    fireEvent.click(timeHeader);
    expect(names()).toEqual(["assets", "older.txt", "newer.txt", "unknown.txt"]);
    expect(timeHeader).toHaveAttribute("data-sort-direction", "ascending");
    fireEvent.click(timeHeader);
    expect(names()).toEqual(["assets", "newer.txt", "older.txt", "unknown.txt"]);
    expect(timeHeader).toHaveAttribute("data-sort-direction", "descending");
  });

  it("shows Unix permissions, special mode bits, and an explicit unavailable state", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [
      { name: "regular.sh", path: "C:/work/regular.sh", isDirectory: false, isSymlink: false, size: 3, modifiedAt: 100, permissionMode: 0o754 },
      { name: "special.sh", path: "C:/work/special.sh", isDirectory: false, isSymlink: false, size: 3, modifiedAt: 100, permissionMode: 0o7754 },
      { name: "windows.txt", path: "C:/work/windows.txt", isDirectory: false, isSymlink: false, size: 3, modifiedAt: 100, permissionMode: null },
    ] });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);

    expect((await ui.findByRole("listitem", { name: /regular\.sh/ })).querySelector(".file-permission")).toHaveTextContent("rwxr-xr--");
    expect(ui.getByRole("listitem", { name: /special\.sh/ }).querySelector(".file-permission")).toHaveTextContent("rwsr-sr-T");
    expect(ui.getByRole("listitem", { name: /windows\.txt/ }).querySelector(".file-permission")).toHaveTextContent("—");
    expect(ui.getByText("权限", { selector: ".file-browser-column-label" })).toBeInTheDocument();
    expect(view.container.querySelector(".file-browser-content>.file-browser-columns")).toBeInTheDocument();
  });

  it.each(["connecting", "awaitingHostKey", "authenticating", "closing", "closed"] as const)("keeps the file surface quiet while the remote session is %s", async (status) => {
    const view = render(<FileBrowserPane initialPath="/srv" runtime={{ ...localRuntime, kind: "sftp", status }} onPathChange={vi.fn()}/>);
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    const ui = within(view.container);
    expect(ui.queryByRole("alert")).not.toBeInTheDocument();
    expect(ui.queryByText("文件连接尚未建立")).not.toBeInTheDocument();
    expect(listRemoteDirectory).not.toHaveBeenCalled();
  });

  it("defers connection failures to the owning workbench block", async () => {
    const view = render(<FileBrowserPane initialPath="/srv" runtime={{ ...localRuntime, kind: "sftp", status: "failed", notice: "认证被远程主机拒绝" }} onPathChange={vi.fn()}/>);

    expect(within(view.container).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(view.container).queryByText("认证被远程主机拒绝")).not.toBeInTheDocument();
    expect(listRemoteDirectory).not.toHaveBeenCalled();
  });

  it("loads the remote directory once a pending file connection succeeds", async () => {
    listRemoteDirectory.mockResolvedValue({ path: "/home/dev", entries: [] });
    const onPathChange = vi.fn();
    const view = render(<FileBrowserPane initialPath="." runtime={{ ...localRuntime, kind: "sftp", status: "connecting" }} onPathChange={onPathChange}/>);
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(listRemoteDirectory).not.toHaveBeenCalled();

    view.rerender(<FileBrowserPane initialPath="." runtime={{ ...localRuntime, kind: "sftp", status: "connected", sessionId: "files-1" }} onPathChange={onPathChange}/>);

    await waitFor(() => expect(listRemoteDirectory).toHaveBeenCalledWith("files-1", "."));
    expect(onPathChange).toHaveBeenCalledWith("/home/dev");
    expect(within(view.container).getByRole("button", { name: "/home/dev" })).toBeInTheDocument();
    expect(within(view.container).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("edits a path and keeps the last listing when the requested path fails", async () => {
    listLocalDirectory.mockResolvedValueOnce({ path: "C:/work", entries: [{ name: "keep.txt", path: "C:/work/keep.txt", isDirectory: false, isSymlink: false, size: 4, modifiedAt: null }] })
      .mockRejectedValueOnce({ message: "路径不存在" });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    await ui.findByRole("listitem", { name: /keep.txt/ });
    fireEvent.click(ui.getByRole("button", { name: "C:/work" }));
    const input = ui.getByRole("textbox", { name: "文件夹路径" });
    expect(input.closest(".file-browser-path-shell")).toHaveAttribute("data-editing", "true");
    fireEvent.change(input, { target: { value: "C:/missing" } });
    fireEvent.submit(input.closest("form")!);

    expect(await ui.findByRole("alert")).toHaveTextContent("路径不存在");
    expect(ui.getByRole("listitem", { name: /keep.txt/ })).toBeInTheDocument();
  });

  it("exits inline path editing when the user returns to the file list", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [{ name: "keep.txt", path: "C:/work/keep.txt", isDirectory: false, isSymlink: false, size: 4, modifiedAt: null }] });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    await ui.findByRole("listitem", { name: /keep.txt/ });
    fireEvent.click(ui.getByRole("button", { name: "C:/work" }));
    fireEvent.pointerEnter(view.container.querySelector(".file-browser-content")!);
    expect(ui.queryByRole("textbox", { name: "文件夹路径" })).not.toBeInTheDocument();

    fireEvent.click(ui.getByRole("button", { name: "C:/work" }));
    fireEvent.scroll(view.container.querySelector(".file-browser-content")!);
    expect(ui.queryByRole("textbox", { name: "文件夹路径" })).not.toBeInTheDocument();
  });

  it("selects a file on the first click and previews it on the second click", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [{ name: "README.md", path: "C:/work/README.md", isDirectory: false, isSymlink: false, size: 7, modifiedAt: null }] });
    readTextFile.mockResolvedValue({ content: "# Hello", revision: "r1", modifiedAt: null, size: 7 });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const file = await ui.findByRole("listitem", { name: /README.md/ });
    fireEvent.click(file);
    expect(file).toHaveAttribute("data-selected", "true");
    expect(readTextFile).not.toHaveBeenCalled();
    fireEvent.click(file);
    expect(await ui.findByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(ui.getByText("预览")).toBeInTheDocument();
    expect(ui.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(ui.queryByRole("textbox", { name: "文件编辑器" })).not.toBeInTheDocument();
    const edit = ui.getByRole("button", { name: "编辑" });
    expect(edit).toBeEnabled();
    expect(edit.querySelector("svg")).toBeInTheDocument();
    expect(edit).toHaveTextContent("编辑");
    fireEvent.click(edit);
    expect(await ui.findByText("实验功能")).toHaveClass("ui-status-badge--tag", "ui-status-badge--warning");
    expect(await ui.findByRole("textbox", { name: "文件编辑器" })).toHaveValue("# Hello");
    expect(readTextFile).toHaveBeenCalledTimes(1);
  });

  it("centers file read progress in one accessible themed loading popover", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [{ name: "README.md", path: "C:/work/README.md", isDirectory: false, isSymlink: false, size: 7, modifiedAt: null }] });
    let finishRead!: (value: { content: string; revision: string; modifiedAt: null; size: number }) => void;
    readTextFile.mockReturnValue(new Promise((resolve) => { finishRead = resolve; }));
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const file = await ui.findByRole("listitem", { name: /README\.md/ });
    fireEvent.click(file);
    fireEvent.click(file);

    const message = await ui.findByText("正在读取文件…");
    const state = message.closest(".file-loading-state");
    expect(state).toHaveAttribute("role", "status");
    expect(state).toHaveAttribute("aria-live", "polite");
    expect(state?.querySelector(".file-loading-popover")).not.toBeNull();
    expect(state?.querySelector(".file-loading-spinner")).toHaveAttribute("aria-hidden", "true");

    await act(async () => { finishRead({ content: "# Hello", revision: "r1", modifiedAt: null, size: 7 }); });
    expect(await ui.findByRole("heading", { name: "Hello" })).toBeInTheDocument();
  });

  it("adds and removes file selections with the platform modifier while ordinary clicks restore one active item", async () => {
    const first = { name: "alpha.txt", path: "C:/work/alpha.txt", isDirectory: false, isSymlink: false, size: 5, modifiedAt: null };
    const second = { name: "beta.txt", path: "C:/work/beta.txt", isDirectory: false, isSymlink: false, size: 6, modifiedAt: null };
    const folder = { name: "assets", path: "C:/work/assets", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null };
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [first, second, folder] });
    readTextFile.mockResolvedValue({ content: "alpha", revision: "r1", modifiedAt: null, size: 5 });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const firstRow = await ui.findByRole("listitem", { name: /alpha\.txt/ });
    const secondRow = ui.getByRole("listitem", { name: /beta\.txt/ });
    const folderRow = ui.getByRole("listitem", { name: /assets/ });

    fireEvent.click(firstRow);
    fireEvent.click(secondRow, { metaKey: true });
    fireEvent.keyDown(folderRow, { key: " ", ctrlKey: true });
    expect(firstRow).toHaveAttribute("aria-selected", "true");
    expect(secondRow).toHaveAttribute("aria-selected", "true");
    expect(folderRow).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(secondRow, { key: " ", ctrlKey: true });
    expect(secondRow).toHaveAttribute("aria-selected", "false");
    fireEvent.click(firstRow);
    expect(firstRow).toHaveAttribute("aria-selected", "true");
    expect(folderRow).toHaveAttribute("aria-selected", "false");
    expect(readTextFile).not.toHaveBeenCalled();

    fireEvent.click(firstRow);
    await waitFor(() => expect(readTextFile).toHaveBeenCalledWith(null, first.path));
    expect(await ui.findByRole("textbox", { name: "文件只读预览" })).toHaveValue("alpha");
  });

  it("keeps selected files on right click and deletes them through one batch confirmation", async () => {
    const folder = { name: "assets", path: "C:/work/assets", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null };
    const file = { name: "notes.txt", path: "C:/work/notes.txt", isDirectory: false, isSymlink: false, size: 6, modifiedAt: null };
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [folder, file] });
    deleteEntry.mockResolvedValue(undefined);
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const folderRow = await ui.findByRole("listitem", { name: /assets/ });
    const fileRow = ui.getByRole("listitem", { name: /notes\.txt/ });

    fireEvent.click(folderRow);
    fireEvent.click(fileRow, { metaKey: true });
    expect(readTextFile).not.toHaveBeenCalled();
    fireEvent.contextMenu(fileRow);
    const menu = ui.getByRole("menu", { name: "2 个已选项目菜单" });
    expect(within(menu).queryByRole("separator")).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "预览" })).not.toBeInTheDocument();
    expect(readTextFile).not.toHaveBeenCalled();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "删除 2 个项目" }));

    const confirmation = screen.getByRole("dialog", { name: "删除 2 个项目？" });
    expect(confirmation).toHaveTextContent("其中的文件夹及全部内容将被永久删除");
    fireEvent.click(within(confirmation).getByRole("button", { name: "确认删除" }));
    await waitFor(() => {
      expect(deleteEntry).toHaveBeenCalledTimes(2);
      expect(deleteEntry).toHaveBeenCalledWith(null, folder.path);
      expect(deleteEntry).toHaveBeenCalledWith(null, file.path);
    });
    expect(listLocalDirectory).toHaveBeenCalledTimes(2);
    expect(ui.getByRole("status", { name: "文件状态" })).toHaveTextContent("已删除 2 个项目");
  });

  it("switches to a single item when opening the context menu on an unselected file", async () => {
    const entries = ["alpha.txt", "beta.txt", "gamma.txt"].map((name) => ({ name, path: `C:/work/${name}`, isDirectory: false, isSymlink: false, size: 5, modifiedAt: null }));
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const first = await ui.findByRole("listitem", { name: /alpha\.txt/ });
    const second = ui.getByRole("listitem", { name: /beta\.txt/ });
    const third = ui.getByRole("listitem", { name: /gamma\.txt/ });

    fireEvent.click(first);
    fireEvent.click(second, { ctrlKey: true });
    fireEvent.contextMenu(third);

    expect(first).toHaveAttribute("aria-selected", "false");
    expect(second).toHaveAttribute("aria-selected", "false");
    expect(third).toHaveAttribute("aria-selected", "true");
    expect(ui.getByRole("menu", { name: "gamma.txt 文件菜单" })).toBeInTheDocument();
    expect(ui.getByRole("menuitem", { name: "预览" })).toBeInTheDocument();
  });

  it("keeps only failed entries selected when part of a batch deletion fails", async () => {
    const first = { name: "alpha.txt", path: "C:/work/alpha.txt", isDirectory: false, isSymlink: false, size: 5, modifiedAt: null };
    const second = { name: "beta.txt", path: "C:/work/beta.txt", isDirectory: false, isSymlink: false, size: 6, modifiedAt: null };
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [first, second] });
    deleteEntry.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("权限不足"));
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const firstRow = await ui.findByRole("listitem", { name: /alpha\.txt/ });
    const secondRow = ui.getByRole("listitem", { name: /beta\.txt/ });

    fireEvent.click(firstRow);
    fireEvent.click(secondRow, { metaKey: true });
    fireEvent.contextMenu(secondRow);
    fireEvent.click(ui.getByRole("menuitem", { name: "删除 2 个项目" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "删除 2 个项目？" })).getByRole("button", { name: "确认删除" }));

    const retryDialog = await screen.findByRole("dialog", { name: "删除文件？" });
    expect(within(retryDialog).getByRole("alert")).toHaveTextContent("已删除 1 个项目，1 个项目删除失败：权限不足");
    expect(ui.getByRole("listitem", { name: /alpha\.txt/ })).toHaveAttribute("aria-selected", "false");
    expect(ui.getByRole("listitem", { name: /beta\.txt/ })).toHaveAttribute("aria-selected", "true");
    expect(listLocalDirectory).toHaveBeenCalledTimes(2);
  });

  it("opens the separate experimental editor from the context menu and saves changes", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [{ name: "README.md", path: "C:/work/README.md", isDirectory: false, isSymlink: false, size: 7, modifiedAt: null }] });
    readTextFile.mockResolvedValue({ content: "# Hello", revision: "r1", modifiedAt: null, size: 7 });
    writeTextFile.mockResolvedValue({ content: "# Updated", revision: "r2", modifiedAt: null, size: 9 });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const file = await ui.findByRole("listitem", { name: /README.md/ });
    fireEvent.contextMenu(file, { clientX: 20, clientY: 20 });
    expect(ui.getByRole("menuitem", { name: "预览" })).toBeInTheDocument();
    fireEvent.click(ui.getByRole("menuitem", { name: /编辑.*实验/ }));
    const experimental = await ui.findByText("实验功能");
    const toolbar = experimental.closest(".file-preview-toolbar")!;
    expect(toolbar.textContent?.indexOf("实验功能")).toBeLessThan(toolbar.textContent?.indexOf("编辑") ?? 0);
    const editor = await ui.findByRole("textbox", { name: "文件编辑器" });
    const cleanSave = ui.getByRole("button", { name: "已保存" });
    expect(cleanSave).toHaveTextContent("保存");
    expect(cleanSave.querySelector("svg")).toHaveAttribute("data-icon", "check");
    fireEvent.change(editor, { target: { value: "# Updated" } });
    expect(ui.getByText("*", { selector: ".file-dirty-indicator" })).toBeInTheDocument();
    const cancel = ui.getByRole("button", { name: "取消" });
    const save = ui.getByRole("button", { name: "保存" });
    expect(cancel.querySelector("svg")).toBeInTheDocument();
    expect(save.querySelector("svg")).toBeInTheDocument();
    expect(save.querySelector("svg")).toHaveAttribute("data-icon", "save");
    fireEvent.click(save);
    const confirmation = screen.getByRole("dialog", { name: "覆盖保存文件？" });
    expect(confirmation).toHaveTextContent("现有内容将被替换");
    expect(confirmation).toHaveTextContent("C:/work/README.md");
    expect(writeTextFile).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "确认覆盖" }));
    await waitFor(() => expect(writeTextFile).toHaveBeenCalledWith(null, "C:/work/README.md", "# Updated", "r1"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "覆盖保存文件？" })).not.toBeInTheDocument());
    await waitFor(() => expect(ui.queryByText("*", { selector: ".file-dirty-indicator" })).not.toBeInTheDocument());
    expect(ui.getByRole("button", { name: "已保存" })).toHaveTextContent("保存");
    expect(ui.getByRole("button", { name: "已保存" }).querySelector("svg")).toHaveAttribute("data-icon", "check");
    fireEvent.click(ui.getByRole("button", { name: "返回文件夹" }));
    expect(await ui.findByRole("listitem", { name: /README.md/ })).toBeInTheDocument();
  });

  it("routes keyboard save through confirmation and preserves dirty edits after cancellation", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [{ name: "README.md", path: "C:/work/README.md", isDirectory: false, isSymlink: false, size: 7, modifiedAt: null }] });
    readTextFile.mockResolvedValue({ content: "# Hello", revision: "r1", modifiedAt: null, size: 7 });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const file = await ui.findByRole("listitem", { name: /README.md/ });
    fireEvent.contextMenu(file);
    fireEvent.click(ui.getByRole("menuitem", { name: /编辑.*实验/ }));
    const editor = await ui.findByRole("textbox", { name: "文件编辑器" });
    fireEvent.change(editor, { target: { value: "# Keep me" } });

    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    const confirmation = screen.getByRole("dialog", { name: "覆盖保存文件？" });
    expect(writeTextFile).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog", { name: "覆盖保存文件？" })).not.toBeInTheDocument();
    expect(ui.getByRole("textbox", { name: "文件编辑器" })).toHaveValue("# Keep me");
    expect(ui.getByText("*", { selector: ".file-dirty-indicator" })).toBeInTheDocument();
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("keeps the overwrite confirmation and dirty content available when saving fails", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [{ name: "README.md", path: "C:/work/README.md", isDirectory: false, isSymlink: false, size: 7, modifiedAt: null }] });
    readTextFile.mockResolvedValue({ content: "# Hello", revision: "r1", modifiedAt: null, size: 7 });
    writeTextFile.mockRejectedValue(new Error("文件已被其他程序修改"));
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const file = await ui.findByRole("listitem", { name: /README.md/ });
    fireEvent.contextMenu(file);
    fireEvent.click(ui.getByRole("menuitem", { name: /编辑.*实验/ }));
    const editor = await ui.findByRole("textbox", { name: "文件编辑器" });
    fireEvent.change(editor, { target: { value: "# Conflicted" } });
    fireEvent.click(ui.getByRole("button", { name: "保存" }));
    const confirmation = screen.getByRole("dialog", { name: "覆盖保存文件？" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "确认覆盖" }));

    expect(await within(confirmation).findByRole("alert")).toHaveTextContent("文件已被其他程序修改");
    expect(confirmation).toBeInTheDocument();
    expect(ui.getByRole("textbox", { name: "文件编辑器" })).toHaveValue("# Conflicted");
    expect(ui.getByText("*", { selector: ".file-dirty-indicator" })).toBeInTheDocument();
    const retry = within(confirmation).getByRole("button", { name: "确认覆盖" });
    expect(retry).toBeEnabled();
    writeTextFile.mockResolvedValueOnce({ content: "# Conflicted", revision: "r2", modifiedAt: null, size: 12 });
    fireEvent.click(retry);
    await waitFor(() => expect(writeTextFile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "覆盖保存文件？" })).not.toBeInTheDocument());
    expect(ui.queryByText("*", { selector: ".file-dirty-indicator" })).not.toBeInTheDocument();
  });

  it("guards both editor exit actions and keeps dirty content when the user continues editing", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [{ name: "README.md", path: "C:/work/README.md", isDirectory: false, isSymlink: false, size: 7, modifiedAt: null }] });
    readTextFile.mockResolvedValue({ content: "# Hello", revision: "r1", modifiedAt: null, size: 7 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const file = await ui.findByRole("listitem", { name: /README.md/ });
    fireEvent.contextMenu(file);
    fireEvent.click(ui.getByRole("menuitem", { name: /编辑.*实验/ }));
    const editor = await ui.findByRole("textbox", { name: "文件编辑器" });
    fireEvent.change(editor, { target: { value: "# Keep editing" } });

    fireEvent.click(ui.getByRole("button", { name: "返回文件夹" }));
    let leaveConfirmation = screen.getByRole("dialog", { name: "放弃未保存的修改？" });
    expect(leaveConfirmation).toHaveTextContent("C:/work/README.md");
    expect(writeTextFile).not.toHaveBeenCalled();
    fireEvent.click(within(leaveConfirmation).getByRole("button", { name: "继续编辑" }));
    expect(screen.queryByRole("dialog", { name: "放弃未保存的修改？" })).not.toBeInTheDocument();
    expect(ui.getByRole("textbox", { name: "文件编辑器" })).toHaveValue("# Keep editing");
    expect(ui.getByText("*", { selector: ".file-dirty-indicator" })).toBeInTheDocument();

    fireEvent.click(ui.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("dialog", { name: "放弃未保存的修改？" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "放弃未保存的修改？" })).not.toBeInTheDocument();
    expect(ui.getByRole("textbox", { name: "文件编辑器" })).toHaveValue("# Keep editing");

    fireEvent.click(ui.getByRole("button", { name: "取消" }));
    leaveConfirmation = screen.getByRole("dialog", { name: "放弃未保存的修改？" });
    fireEvent.click(within(leaveConfirmation).getByRole("button", { name: "放弃并退出" }));
    expect(await ui.findByRole("listitem", { name: /README.md/ })).toBeInTheDocument();
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("leaves the editor immediately when there are no unsaved changes", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [{ name: "README.md", path: "C:/work/README.md", isDirectory: false, isSymlink: false, size: 7, modifiedAt: null }] });
    readTextFile.mockResolvedValue({ content: "# Hello", revision: "r1", modifiedAt: null, size: 7 });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const file = await ui.findByRole("listitem", { name: /README.md/ });
    fireEvent.contextMenu(file);
    fireEvent.click(ui.getByRole("menuitem", { name: /编辑.*实验/ }));
    await ui.findByRole("textbox", { name: "文件编辑器" });

    fireEvent.click(ui.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog", { name: "放弃未保存的修改？" })).not.toBeInTheDocument();
    expect(await ui.findByRole("listitem", { name: /README.md/ })).toBeInTheDocument();
  });

  it("does not offer the experimental editor for images", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [{ name: "photo.jpg", path: "C:/work/photo.jpg", isDirectory: false, isSymlink: false, size: 7, modifiedAt: null }] });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    fireEvent.contextMenu(await ui.findByRole("listitem", { name: /photo.jpg/ }));
    expect(ui.getByRole("menuitem", { name: "预览" })).toBeInTheDocument();
    expect(ui.queryByRole("menuitem", { name: /编辑/ })).not.toBeInTheDocument();
    fireEvent.click(ui.getByRole("menuitem", { name: "预览" }));
    expect(await ui.findByRole("button", { name: "编辑" })).toBeDisabled();
  });

  it("keeps a compact footer with the current directory counts", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [
      { name: "src", path: "C:/work/src", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null },
      { name: "README.md", path: "C:/work/README.md", isDirectory: false, isSymlink: false, size: 7, modifiedAt: null },
    ] });
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const status = await within(view.container).findByRole("status", { name: "文件状态" });
    await waitFor(() => expect(status).toHaveTextContent("1 个文件夹"));
    expect(status).toHaveTextContent("1 个文件");
  });

  it("downloads a remote folder from the mouse or keyboard context menu", async () => {
    listRemoteDirectory.mockResolvedValue({ path: "/srv", entries: [{ name: "release", path: "/srv/release", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null }] });
    selectDownloadDirectory.mockResolvedValue("C:/Downloads/release");
    downloadDirectory.mockResolvedValue("transfer-1");
    const runtime = { ...localRuntime, kind: "sftp" as const, sessionId: "session-1" };
    const view = render(<FileBrowserPane initialPath="/srv" runtime={runtime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const folder = await ui.findByRole("listitem", { name: /release/ });
    fireEvent.keyDown(folder, { key: "F10", shiftKey: true });
    fireEvent.click(ui.getByRole("menuitem", { name: "下载到本地…" }));

    await waitFor(() => expect(downloadDirectory).toHaveBeenCalledWith("session-1", "/srv/release", "C:/Downloads/release", expect.any(Function)));
    const update = downloadDirectory.mock.calls[0][3] as (event: TransferEvent) => void;
    act(() => {
      update({ type: "started", totalBytes: 100 });
      update({ type: "progress", transferredBytes: 40, totalBytes: 100 });
    });
    expect(ui.getByRole("progressbar", { name: "下载进度" })).toHaveAttribute("value", "40");
    expect(ui.getByRole("status", { name: "文件状态" })).toHaveTextContent("40 B / 100 B");

    act(() => update({ type: "completed" }));
    expect(ui.queryByRole("progressbar", { name: "下载进度" })).not.toBeInTheDocument();
    expect(ui.getByRole("status", { name: "文件状态" })).toHaveTextContent("1 个文件夹");
    expect(ui.getByRole("status", { name: "文件状态" })).toHaveTextContent("下载完成");
  });

  it("copies a selected file or folder path through the system clipboard", async () => {
    const entry = { name: "assets", path: "C:/work/assets", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null };
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [entry] });
    writeClipboardText.mockResolvedValue(undefined);
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);

    fireEvent.contextMenu(await ui.findByRole("listitem", { name: /assets/ }), { clientX: 40, clientY: 80 });
    fireEvent.click(ui.getByRole("menuitem", { name: "复制路径" }));

    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith("C:/work/assets"));
    expect(ui.queryByRole("menu", { name: /assets/ })).not.toBeInTheDocument();
    expect(ui.getByRole("status", { name: "文件状态" })).toHaveTextContent("路径已复制");
  });

  it("measures and flips a context menu near the bottom-right viewport edge", async () => {
    const entry = { name: "notes.txt", path: "C:/work/notes.txt", isDirectory: false, isSymlink: false, size: 5, modifiedAt: null };
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [entry] });
    const width = vi.spyOn(window, "innerWidth", "get").mockReturnValue(400);
    const height = vi.spyOn(window, "innerHeight", "get").mockReturnValue(400);
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("file-context-menu")) return { x: 0, y: 0, left: 0, top: 0, right: 180, bottom: 120, width: 180, height: 120, toJSON: () => ({}) };
      return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
    });
    try {
      const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
      const ui = within(view.container);

      fireEvent.contextMenu(await ui.findByRole("listitem", { name: /notes\.txt/ }), { clientX: 390, clientY: 390 });
      const menu = ui.getByRole("menu", { name: /notes\.txt/ });
      await waitFor(() => expect(menu).toHaveStyle({ left: "214px", top: "270px" }));
      expect(menu).toHaveAttribute("data-placement", "above");
    } finally {
      rect.mockRestore(); width.mockRestore(); height.mockRestore();
    }
  });

  it("copies and renames entries through compact naming dialogs", async () => {
    const entry = { name: "notes.txt", path: "C:/work/notes.txt", isDirectory: false, isSymlink: false, size: 5, modifiedAt: null };
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [entry] });
    copyFile.mockResolvedValue(undefined);
    renameEntry.mockResolvedValue(undefined);
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    const file = await ui.findByRole("listitem", { name: /notes.txt/ });

    fireEvent.contextMenu(file);
    fireEvent.click(ui.getByRole("menuitem", { name: "复制文件…" }));
    const copyInput = screen.getByRole("textbox", { name: "副本名称" });
    expect(copyInput).toHaveValue("notes - 副本.txt");
    fireEvent.change(copyInput, { target: { value: "notes-copy.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "创建副本" }));
    await waitFor(() => expect(copyFile).toHaveBeenCalledWith(null, entry.path, "notes-copy.txt"));

    fireEvent.contextMenu(await ui.findByRole("listitem", { name: /notes.txt/ }));
    fireEvent.click(ui.getByRole("menuitem", { name: "改名…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "新名称" }), { target: { value: "renamed.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));
    await waitFor(() => expect(renameEntry).toHaveBeenCalledWith(null, entry.path, "renamed.txt"));
  });

  it("creates files and folders from icon-only controls immediately before refresh", async () => {
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [] });
    createEntry.mockResolvedValue(undefined);
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    await ui.findByText("此文件夹为空");
    const navigation = ui.getByRole("navigation", { name: "文件夹导航" });
    const buttons = within(navigation).getAllByRole("button");
    expect(buttons.slice(-3).map((button) => button.getAttribute("aria-label"))).toEqual(["创建文件", "创建文件夹", "刷新文件夹"]);
    expect(ui.getByRole("button", { name: "创建文件" })).toHaveAttribute("title", "创建文件");
    expect(ui.getByRole("button", { name: "创建文件夹" })).toHaveAttribute("title", "创建文件夹");

    fireEvent.click(ui.getByRole("button", { name: "创建文件" }));
    const fileDialog = screen.getByRole("dialog", { name: "创建文件" });
    fireEvent.change(within(fileDialog).getByRole("textbox", { name: "文件名称" }), { target: { value: "notes.txt" } });
    fireEvent.click(within(fileDialog).getByRole("button", { name: "创建文件" }));
    await waitFor(() => expect(createEntry).toHaveBeenCalledWith(null, "C:/work", "notes.txt", false));

    fireEvent.click(ui.getByRole("button", { name: "创建文件夹" }));
    const folderDialog = screen.getByRole("dialog", { name: "创建文件夹" });
    fireEvent.change(within(folderDialog).getByRole("textbox", { name: "文件夹名称" }), { target: { value: "assets" } });
    fireEvent.click(within(folderDialog).getByRole("button", { name: "创建文件夹" }));
    await waitFor(() => expect(createEntry).toHaveBeenCalledWith(null, "C:/work", "assets", true));
  });

  it("requires a second confirmation before deleting an entry", async () => {
    const entry = { name: "archive", path: "C:/work/archive", isDirectory: true, isSymlink: false, size: 0, modifiedAt: null };
    listLocalDirectory.mockResolvedValue({ path: "C:/work", entries: [entry] });
    deleteEntry.mockResolvedValue(undefined);
    const view = render(<FileBrowserPane initialPath="C:/work" runtime={localRuntime} onPathChange={vi.fn()}/>);
    const ui = within(view.container);
    fireEvent.contextMenu(await ui.findByRole("listitem", { name: /archive/ }));
    fireEvent.click(ui.getByRole("menuitem", { name: "删除" }));
    const firstConfirmation = screen.getByRole("dialog", { name: "删除文件夹？" });
    expect(firstConfirmation).toHaveTextContent("全部内容将被永久删除");
    fireEvent.click(within(firstConfirmation).getByRole("button", { name: "取消" }));
    expect(deleteEntry).not.toHaveBeenCalled();

    fireEvent.contextMenu(ui.getByRole("listitem", { name: /archive/ }));
    fireEvent.click(ui.getByRole("menuitem", { name: "删除" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "删除文件夹？" })).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith(null, entry.path));
  });

  it("shows a native drop overlay only over the remote file area and uploads to the current path", async () => {
    const runtime = { ...localRuntime, kind: "sftp" as const, sessionId: "session-1" };
    listRemoteDirectory.mockResolvedValue({ path: "/srv", entries: [] });
    uploadDroppedEntries.mockResolvedValue("transfer-drop");
    const view = render(<FileBrowserPane initialPath="/srv" runtime={runtime} onPathChange={vi.fn()}/>);
    await waitFor(() => expect(dragDrop.handler).toBeTypeOf("function"));
    document.querySelectorAll(".dialog-scrim").forEach((element) => element.remove());
    const content = view.container.querySelector(".file-browser-content")!;
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 500, bottom: 400, width: 500, height: 400, x: 0, y: 0, toJSON: () => ({}) });

    act(() => dragDrop.handler?.({ payload: { type: "enter", paths: ["C:/drop/a.txt"], position: { x: 100, y: 100 } } }));
    const overlay = view.container.querySelector<HTMLElement>(".file-upload-drop-overlay")!;
    expect(within(overlay).getByText("上传到当前目录")).toBeInTheDocument();
    expect(within(overlay).getByText("/srv")).toBeInTheDocument();
    act(() => dragDrop.handler?.({ payload: { type: "drop", paths: ["C:/drop/a.txt"], position: { x: 100, y: 100 } } }));
    await waitFor(() => expect(uploadDroppedEntries).toHaveBeenCalledWith("session-1", ["C:/drop/a.txt"], "/srv", expect.any(Function)));
    expect(view.container.querySelector(".file-upload-drop-overlay")).not.toBeInTheDocument();

    uploadDroppedEntries.mockClear();
    const modalScrim = document.createElement("div");
    modalScrim.className = "dialog-scrim";
    document.body.append(modalScrim);
    act(() => dragDrop.handler?.({ payload: { type: "drop", paths: ["C:/drop/key"], position: { x: 100, y: 100 } } }));
    expect(uploadDroppedEntries).not.toHaveBeenCalled();
    modalScrim.remove();
  });
});

describe("parentPath", () => {
  it("handles Windows and POSIX roots", () => {
    expect(parentPath("C:\\Users\\Test", true)).toBe("C:\\Users");
    expect(parentPath("C:\\", true)).toBeNull();
    expect(parentPath("\\\\?\\D:\\GIT", true)).toBe("\\\\?\\D:\\");
    expect(parentPath("\\\\?\\D:\\", true)).toBeNull();
    expect(parentPath("\\\\server\\share\\folder", true)).toBe("\\\\server\\share\\");
    expect(parentPath("\\\\server\\share\\", true)).toBeNull();
    expect(parentPath("/srv/app", false)).toBe("/srv");
    expect(parentPath("/", false)).toBeNull();
  });

  it("formats Windows implementation paths without changing root detection", () => {
    expect(displayLocalPath("\\\\?\\D:\\GIT")).toBe("D:\\GIT");
    expect(displayLocalPath("\\\\?\\UNC\\server\\share\\folder")).toBe("\\\\server\\share\\folder");
    expect(isWindowsDriveRoot("D:\\")).toBe(true);
    expect(isWindowsDriveRoot("\\\\?\\D:\\")).toBe(true);
    expect(isWindowsDriveRoot("D:\\GIT")).toBe(false);
  });
});

function testRect(top: number, bottom: number): DOMRect {
  return { x: 0, y: top, top, right: 100, bottom, left: 0, width: 100, height: bottom - top, toJSON: () => ({}) };
}
