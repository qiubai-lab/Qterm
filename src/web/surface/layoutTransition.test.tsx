import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LayoutDragOverlay } from "../../workspace/LayoutDragOverlay";
import { calculateLayoutGeometry } from "../../workspace/layoutGeometry";
import { registerNativeSurface } from "./nativeSurfaceCoordinator";
import type { WebBounds, WebSnapshot } from "../../lib/tauri/web";

const ipc = vi.hoisted(() => ({ sync: vi.fn<(id: string, bounds: WebBounds) => Promise<void>>(async () => {}), capture: vi.fn<() => Promise<WebSnapshot>>() }));
vi.mock("../../lib/tauri/web", () => ({ syncWeb: ipc.sync, captureWeb: ipc.capture }));
const geometry = calculateLayoutGeometry({ type: "split", id: "split", direction: "horizontal", ratio: .5,
  first: { type: "web", blockId: "web-a", profileId: null }, second: { type: "web", blockId: "web-b", profileId: null } });
const snapshot = { url: "https://fixture/", png: "aW1hZ2U=" };
const frames = new Map<number, FrameRequestCallback>();
const disposers: (() => void)[] = [];
let sequence = 0;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
async function tick() {
  await act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); await flush(); });
}
function surface(id: string, x: number, visible = true) {
  const element = document.createElement("div"); document.body.append(element);
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(x, 40, 480, 400));
  disposers.push(registerNativeSurface({ id, element, visible: () => visible, revision: () => 1, url: () => snapshot.url, snapshotReady: () => true, onError: vi.fn() }));
  return element;
}
function overlay() {
  const view = render(<LayoutDragOverlay drag={{ sourceId: "web-a", targetId: "web-b", position: "left", x: 520, y: 250 }} geometry={geometry}/>);
  vi.spyOn(view.container.querySelector<HTMLElement>(".layout-drag-surface")!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 500));
  return view;
}
beforeEach(() => {
  ipc.sync.mockClear(); ipc.capture.mockReset().mockResolvedValue(snapshot);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.set(++sequence, callback); return sequence; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
  Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: vi.fn(async () => {}) });
});
afterEach(() => { cleanup(); disposers.splice(0).forEach(dispose => dispose()); document.body.innerHTML = ""; frames.clear(); vi.restoreAllMocks(); });

it("bridges a workspace drag through previews without hiding any active guest and restores new geometry", async () => {
  const first = surface("a", 0), second = surface("b", 500);
  surface("other-workspace", 1100); surface("inactive-tab", 0, false);
  await tick();
  const view = overlay();
  await tick();
  expect(ipc.sync.mock.calls.filter(([id]) => id === "a").pop()?.[1]).toMatchObject({ visible: true, inputBlocked: true, covered: false });
  for (let i = 0; i < 4; i++) await tick();
  for (const id of ["a", "b"]) {
    expect(ipc.sync.mock.calls.filter(([guest]) => guest === id).pop()?.[1]).toMatchObject({ visible: true, inputBlocked: true, covered: true });
    expect(ipc.sync.mock.calls.filter(([guest]) => guest === id).every(([, bounds]) => bounds.visible)).toBe(true);
  }
  expect(first.querySelector("img")).not.toBeNull(); expect(second.querySelector("img")).not.toBeNull();
  expect(ipc.capture).toHaveBeenCalledTimes(2);
  expect(ipc.sync.mock.calls.filter(([id]) => id === "other-workspace").pop()?.[1].inputBlocked).toBe(false);
  vi.mocked(second.getBoundingClientRect).mockReturnValue(new DOMRect(600, 40, 380, 400));
  view.unmount(); await tick(); await tick();
  expect(ipc.sync.mock.calls.filter(([id]) => id === "b").pop()?.[1]).toMatchObject({ x: 600, width: 380, visible: true, inputBlocked: false, covered: false });
  expect(first.querySelector("img")).toBeNull(); expect(second.querySelector("img")).toBeNull();
});

it("releases input immediately on cancellation while a drag snapshot is still pending", async () => {
  let resolve!: (value: WebSnapshot) => void;
  ipc.capture.mockImplementation(() => new Promise(done => { resolve = done; }));
  const page = surface("a", 0); await tick();
  const view = overlay(); await tick();
  view.unmount(); await tick();
  expect(ipc.sync.mock.lastCall?.[1]).toMatchObject({ visible: true, inputBlocked: false, covered: false });
  resolve(snapshot); await flush(); await tick();
  expect(page.querySelector("img")).toBeNull();
  expect(ipc.sync.mock.calls.every(([, bounds]) => bounds.visible)).toBe(true);
});
