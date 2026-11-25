import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockWindows } from "@tauri-apps/api/mocks";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { Webview } from "@tauri-apps/api/webview";
import { afterEach, expect, it, vi } from "vitest";
import * as files from "../lib/tauri/files";
import * as transfers from "../lib/tauri/transfers";
import { FileBrowserPane } from "./FileBrowserPane";

afterEach(() => {
  cleanup();
  clearMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uploads a Finder drop only inside the file list on a Retina display", async () => {
  mockWindows("main");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  vi.stubGlobal("devicePixelRatio", 2);
  const subscribe = vi.spyOn(Webview.prototype, "onDragDropEvent").mockResolvedValue(() => {});
  vi.spyOn(files, "listRemoteDirectory").mockResolvedValue({ path: "/srv", entries: [] });
  const upload = vi.spyOn(transfers, "uploadDroppedEntries").mockResolvedValue("upload-id");
  const runtime = { kind: "sftp" as const, sessionId: "session-1", status: "connected" as const, hostKeyPrompt: null, notice: "", connectionProgress: null };
  const view = render(<FileBrowserPane initialPath="/srv" runtime={runtime} onPathChange={vi.fn()}/>);
  await waitFor(() => expect(subscribe).toHaveBeenCalled());
  const content = view.container.querySelector(".file-browser-content")!;
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue(new DOMRect(400, 100, 500, 400));
  const emit = subscribe.mock.lastCall![0];
  const paths = ["/tmp/photo.RW2"];
  const position = new PhysicalPosition(600, 250);

  act(() => emit({ event: "tauri://drag-enter", id: 1, payload: { type: "enter", paths, position } }));
  expect(screen.getByText("释放鼠标以上传文件或文件夹")).toBeVisible();
  act(() => emit({ event: "tauri://drag-over", id: 1, payload: { type: "over", position: new PhysicalPosition(300, 250) } }));
  expect(screen.queryByText("释放鼠标以上传文件或文件夹")).toBeNull();
  act(() => emit({ event: "tauri://drag-drop", id: 1, payload: { type: "drop", paths, position: new PhysicalPosition(1000, 250) } }));
  expect(upload).not.toHaveBeenCalled();
  await act(async () => emit({ event: "tauri://drag-drop", id: 1, payload: { type: "drop", paths, position } }));
  expect(upload).toHaveBeenCalledExactlyOnceWith("session-1", paths, "/srv", expect.any(Function));
});
