import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { TabActionMenu } from "../components/TabActionMenu";
import { useWebBrowser } from "./useWebBrowser";
import type { WebBounds } from "../lib/tauri/web";

const ipc = vi.hoisted(() => ({
  open: vi.fn<(id: string, session: string, profile: string, url: string) => Promise<void>>(async () => {}),
  close: vi.fn(async () => {}), sync: vi.fn<(id: string, bounds: WebBounds) => Promise<void>>(async () => {}),
}));
vi.mock("../lib/tauri/web", () => ({
  openWeb: ipc.open, closeWeb: ipc.close, syncWeb: ipc.sync,
  listenWebPages: vi.fn(async () => () => {}), listenWebFocus: vi.fn(async () => () => {}),
  readWebMetrics: vi.fn(async () => null),
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function Page({ menu = false, modal = false }) {
  const surface = useRef<HTMLDivElement>(null);
  const browser = useWebBrowser(surface, "ssh", "profile", true);
  return <>
    <button onClick={() => void browser.navigate("https://fixture.invalid")}>打开网页</button>
    <div ref={surface} data-testid="surface"/>
    {menu && <TabActionMenu x={80} y={60} label="网页标签操作" nativeOverlay="tab-menu"
      items={[{ id: "close", label: "关闭当前标签", count: 1 }]} onChoose={() => {}} onDismiss={() => {}}/>}
    {modal && <div role="dialog" aria-label="确认"/>}
  </>;
}

it("keeps the same native page visible during the real tab menu and restores its clipped region on dismissal", async () => {
  let nextFrame!: FrameRequestCallback;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { nextFrame = callback; return 1; });
  const view = render(<Page/>);
  vi.spyOn(screen.getByTestId("surface"), "getBoundingClientRect").mockReturnValue(new DOMRect(20, 100, 600, 400));
  await act(async () => screen.getByText("打开网页").click());
  await waitFor(() => expect(ipc.sync).toHaveBeenCalled());
  const guest = ipc.open.mock.calls[0];
  view.rerender(<Page menu/>);
  const menu = screen.getByRole("menu", { name: "网页标签操作" });
  menu.style.cssText = "border-radius:7px;background:rgb(25,27,31)";
  // A header menu begins above the guest and only overlaps its upper edge.
  vi.spyOn(menu, "getBoundingClientRect").mockReturnValue(new DOMRect(80, 60, 150, 140));
  await act(async () => nextFrame(1));
  expect(ipc.sync).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ visible: true }));
  const bounds = ipc.sync.mock.lastCall![1];
  expect(bounds.occlusions!.length).toBeGreaterThan(0);
  for (const cut of bounds.occlusions!) {
    expect(cut.x).toBeGreaterThanOrEqual(60);
    expect(cut.x + cut.width).toBeLessThanOrEqual(210);
    expect(cut.y).toBeGreaterThanOrEqual(0);
    expect(cut.y + cut.height).toBeLessThanOrEqual(100);
  }
  view.rerender(<Page menu modal/>);
  await act(async () => nextFrame(2));
  expect(ipc.sync).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ visible: false }));
  view.rerender(<Page/>);
  await act(async () => nextFrame(3));
  expect(ipc.sync).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ visible: true, occlusions: [], panels: [] }));
  expect(ipc.open).toHaveBeenCalledExactlyOnceWith(...guest);
  expect(ipc.close).not.toHaveBeenCalled();
});
