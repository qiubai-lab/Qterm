import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { TabActionMenu } from "../components/TabActionMenu";
import { DialogFrame } from "../components/dialogs/DialogFrame";
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
  captureWeb: vi.fn(async () => { throw new Error("preview unavailable"); }),
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function Page({ menu = false, modal = false }) {
  const surface = useRef<HTMLDivElement>(null);
  const browser = useWebBrowser(surface, "ssh", "profile", true);
  return <>
    <button onClick={() => void browser.navigate("https://fixture.invalid")}>打开网页</button>
    <div ref={surface} data-testid="surface"/>
    {menu && <TabActionMenu x={80} y={60} label="网页标签操作" keepOnInternalScroll
      items={[{ id: "close", label: "关闭当前标签", count: 1 }]} onChoose={() => {}} onDismiss={() => {}}/>}
    {modal && <DialogFrame title="确认" onClose={() => {}}>确认操作</DialogFrame>}
  </>;
}

it("keeps the same native page visible during the real tab menu and restores its clipped region on dismissal", async () => {
  const frames = new Map<number, FrameRequestCallback>(); let frameId = 0;
  const nextFrame = (time: number) => { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(time)); };
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.set(++frameId, callback); return frameId; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
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
  vi.spyOn(document.querySelector<HTMLElement>(".dialog-scrim")!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  await act(async () => nextFrame(2));
  await waitFor(() => expect(ipc.sync).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ visible: true, inputBlocked: true, covered: true })));
  view.rerender(<Page/>);
  await act(async () => nextFrame(3));
  expect(ipc.sync).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ visible: true, occlusions: [], panels: [] }));
  expect(ipc.open).toHaveBeenCalledExactlyOnceWith(...guest);
  expect(ipc.close).not.toHaveBeenCalled();
});
