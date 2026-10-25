import { afterEach, expect, it, vi } from "vitest";
import type { WebBounds } from "../../lib/tauri/web";
import { registerNativeSurface } from "./nativeSurfaceCoordinator";

const ipc = vi.hoisted(() => ({ sync: vi.fn<(id: string, bounds: WebBounds) => Promise<void>>(async () => {}) }));
vi.mock("../../lib/tauri/web", () => ({ syncWeb: ipc.sync, captureWeb: vi.fn(() => new Promise(() => {})) }));
const dispose: (() => void)[] = [];
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
afterEach(() => { dispose.splice(0).forEach(stop => stop()); document.body.innerHTML = ""; vi.restoreAllMocks(); vi.clearAllMocks(); });

it("measures one overlay snapshot across guests, skips hidden geometry and deduplicates steady native writes", async () => {
  let tick!: FrameRequestCallback;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { tick = callback; return 1; });
  const overlay = document.createElement("div"); overlay.dataset.appOverlay = "floating"; document.body.append(overlay);
  const measured = vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue(new DOMRect(250, 20, 100, 80));
  for (let index = 0; index < 3; index++) {
    const element = document.createElement("div"); document.body.append(element);
    const rect = vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(index * 300, 0, 300, 300));
    dispose.push(registerNativeSurface({ id: String(index), element, visible: () => index < 2,
      revision: () => 1, url: () => "https://fixture/", snapshotReady: () => true, onError: vi.fn() }));
    if (index === 2) expect(rect).not.toHaveBeenCalled();
  }
  await flush(); measured.mockClear();
  tick(1); await flush();
  expect(measured).toHaveBeenCalledTimes(1);
  for (const id of ["0", "1"]) {
    expect(ipc.sync.mock.calls.filter(call => call[0] === id).pop()?.[1]).toMatchObject({ visible: true, covered: false,
      occlusions: [{ x: id === "0" ? 250 : 0, y: 20, width: 50, height: 80 }] });
  }
  const writes = ipc.sync.mock.calls.length;
  tick(2); await flush();
  expect(ipc.sync).toHaveBeenCalledTimes(writes);
  overlay.dataset.appOverlay = "modal";
  vi.mocked(overlay.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 200, 200));
  tick(3); await flush();
  expect(ipc.sync.mock.calls.filter(call => call[0] === "0").pop()?.[1].inputBlocked).toBe(true);
  expect(ipc.sync.mock.calls.filter(call => call[0] === "1").pop()?.[1].inputBlocked).toBe(false);
});
