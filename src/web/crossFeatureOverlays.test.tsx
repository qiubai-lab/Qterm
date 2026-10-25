import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FileBrowserPane } from "../files/FileBrowserPane";
import { FileTextContextMenu } from "../files/FileTextContextMenu";
import { GitRepositoryHistoryPopover } from "../git/GitRepositoryHistoryPopover";
import { NetworkPane } from "../network/NetworkPane";
import { dispatchNativeInteraction } from "../components/overlays/nativeInteraction";
import { measureAppOverlays } from "../components/overlays/overlayRegistry";
import { webSurfaceVisible } from "./webModel";
import { webSurfaceOcclusions } from "./webSurfaceOcclusion";
import { surfaceNeedsCover } from "./surface/nativeSurfaceCoordinator";

vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }) }));
vi.mock("../lib/tauri/files", async importOriginal => ({ ...await importOriginal<object>(),
  listLocalDirectory: async () => ({ path: "C:/fixture", entries: [
    { name: "example.txt", path: "C:/fixture/example.txt", isDirectory: false, size: 12, modifiedAt: null },
  ] }),
}));
vi.mock("../lib/tauri/network", async importOriginal => ({ ...await importOriginal<object>(),
  listNetworkRules: async () => [{ id: "rule", profileId: "profile", name: "Fixture", type: "local", bindHost: "127.0.0.1", bindPort: 8080, targetHost: "localhost", targetPort: 80, exposed: false }],
}));
beforeEach(() => { Reflect.set(window, "__TAURI_INTERNALS__", {}); });
afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.restoreAllMocks(); Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); });

function verifyLocalOverlap(element: HTMLElement) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(180, 120, 200, 80));
  const overlays = measureAppOverlays();
  expect(overlays.some(overlay => overlay.element === element)).toBe(true);
  expect(webSurfaceVisible(document.body, true)).toBe(true);
  // One portal crosses two adjacent browser blocks; a third is untouched.
  for (const rect of [new DOMRect(0, 100, 280, 300), new DOMRect(280, 100, 280, 300)]) {
    expect(webSurfaceOcclusions(rect, overlays)).toHaveLength(1);
    expect(surfaceNeedsCover(rect, overlays, 1, 0)).toBe(false);
  }
  expect(webSurfaceOcclusions(new DOMRect(600, 100, 280, 300), overlays)).toEqual([]);
}

function clickNative() {
  const surface = document.createElement("div"); surface.tabIndex = -1;
  document.body.append(surface); surface.focus();
  act(() => dispatchNativeInteraction(surface));
  expect(surface).toHaveFocus();
  return surface;
}

it("keeps file-list context menus local and dismisses them on a native-page interaction", async () => {
  render(<FileBrowserPane initialPath="C:/fixture" onPathChange={() => {}} runtime={{ sessionId: null, kind: "local", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null }}/>);
  fireEvent.contextMenu(await screen.findByRole("listitem", { name: /example.txt/ }), { clientX: 180, clientY: 120 });
  verifyLocalOverlap(screen.getByRole("menu"));
  clickNative();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("keeps the editor menu local and dismisses without restoring its editor focus", () => {
  const dismiss = vi.fn();
  render(<FileTextContextMenu anchor={{ x: 180, y: 120 }} label="编辑器菜单" focusOnOpen={false}
    groups={[[{ label: "复制", onSelect() {} }]]} onDismiss={dismiss}/>);
  verifyLocalOverlap(screen.getByRole("menu"));
  clickNative(); expect(dismiss).toHaveBeenCalledWith(false);
});

it("keeps network context menus local and closes them when the already-focused guest is clicked again", async () => {
  render(<NetworkPane profileId="profile"/>);
  const item = await screen.findByRole("listitem", { name: "Fixture，已停止" });
  fireEvent.contextMenu(item, { clientX: 180, clientY: 120 });
  verifyLocalOverlap(screen.getByRole("menu"));
  const surface = clickNative(); expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  fireEvent.contextMenu(item, { clientX: 180, clientY: 120 });
  act(() => dispatchNativeInteraction(surface));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("treats a real Git history dialog as a local nonmodal popover", () => {
  render(<GitRepositoryHistoryPopover repositories={[]} currentRepository={null} triggerLabel="仓库历史" onSelect={() => {}} onBrowse={() => {}}/>);
  fireEvent.click(screen.getByRole("button", { name: "仓库历史" }));
  verifyLocalOverlap(screen.getByRole("dialog"));
  clickNative(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
