import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RemoteWorkbenchFrame } from "./RemoteWorkbenchFrame";
import { DesktopEnvironments, serverKey } from "./environments";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { clearMocks, mockWindows } from "@tauri-apps/api/mocks";
import { Webview } from "@tauri-apps/api/webview";
import type { RuntimeFrame } from "./frame";

afterEach(cleanup);
afterEach(() => { clearMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([
  { platform: "Win32", ratio: 1.5, raw: [99, 180], expected: [75, 120] },
  { platform: "MacIntel", ratio: 2, raw: [66, 120], expected: [100, 160] },
])("delivers the $platform drop only to its foreground member in frame coordinates", async ({ platform, ratio, raw, expected }) => {
  mockWindows("main");
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  const entry = { id: "drop", name: "开发服", endpoint: "https://dev.test" };
  const host = new DesktopEnvironments({ connect: async url => url, disconnect: async () => {} });
  await host.connect(entry);
  const env = host.find(serverKey(entry.id))!;
  const view = render(<RemoteWorkbenchFrame host={host} env={env} visible shortcut={vi.fn()}/>);
  const frame = screen.getByLabelText("开发服 工作台") as RuntimeFrame;
  vi.stubGlobal("devicePixelRatio", ratio);
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(new DOMRect(16, 40, 800, 600));
  const stop = vi.fn();
  const subscribe = vi.spyOn(Webview.prototype, "onDragDropEvent").mockResolvedValue(stop);
  const handle = vi.fn();
  const unsubscribe = await frame.qtermWorkbench!.fileDrop.listen(handle);
  const emit = subscribe.mock.calls[0][0];
  const drop = { event: "tauri://drag-drop", id: 1, payload: {
    type: "drop" as const, position: new PhysicalPosition(raw[0], raw[1]), paths: ["C:/drop/a.txt"],
  } };

  host.focus("local");
  emit(drop);
  expect(handle).not.toHaveBeenCalled();
  host.focus(env.key);
  emit(drop);
  expect(handle).toHaveBeenCalledExactlyOnceWith({ ...drop, payload: {
    ...drop.payload, position: new PhysicalPosition(expected[0], expected[1]),
  } });
  view.unmount();
  unsubscribe();
  emit(drop);
  expect(stop).toHaveBeenCalledOnce();
  expect(handle).toHaveBeenCalledTimes(1);
});

it("keeps the remote document mounted and confines verification to the terminal beside the disabled rail", async () => {
  const entry = { id: "frame", name: "开发服", endpoint: "https://dev.test" };
  const host = new DesktopEnvironments({ connect: async url => url, disconnect: async () => {} });
  await host.connect(entry);
  const env = host.find(serverKey(entry.id))!;
  const shortcut = vi.fn();
  const frame = (status: string) => <RemoteWorkbenchFrame host={host} env={{...env, status}} visible shortcut={shortcut}/>;
  const view = render(frame("需要登录"));
  const documentFrame = screen.getByLabelText("开发服 工作台");
  const assertGated = () => {
    expect(documentFrame.closest(".terminal-block")).toBeVisible();
    const controls = within(screen.getByRole("complementary", {name: "工具"})).getAllByRole("button");
    expect(controls).toHaveLength(10);
    controls.forEach(button => expect(button).toBeDisabled());
  };
  assertGated();
  view.rerender(frame("已连接"));
  expect(screen.getByLabelText("开发服 工作台")).toBe(documentFrame);
  expect(screen.queryByRole("complementary", {name: "工具"})).toBeNull();
  expect(documentFrame.closest(".terminal-block")).toBeNull();
  view.rerender(frame("已锁定"));
  assertGated();
  expect(screen.getByLabelText("开发服 工作台")).toBe(documentFrame);
});
