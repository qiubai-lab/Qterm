import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSurfaceSync, type SurfaceIntent } from "./surfaceSync";
import type { WebBounds, WebSnapshot } from "../../lib/tauri/web";

const ipc = vi.hoisted(() => ({ sync: vi.fn<(id: string, bounds: WebBounds) => Promise<void>>(async () => {}),
  capture: vi.fn<(id: string) => Promise<WebSnapshot>>() }));
vi.mock("../../lib/tauri/web", () => ({ syncWeb: ipc.sync, captureWeb: ipc.capture }));
const snapshot = { url: "http://fixture/", png: "aW1hZ2U=" };
const intent = (cover: boolean, revision = 1): SurfaceIntent => ({ cover, revision, url: snapshot.url,
  bounds: { x: 10, y: 20, width: 400, height: 300, visible: true, occlusions: [], panels: [] } });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
let surface: HTMLElement;
let sync: ReturnType<typeof createSurfaceSync>;
beforeEach(() => {
  vi.clearAllMocks(); ipc.sync.mockResolvedValue(undefined); ipc.capture.mockResolvedValue(snapshot);
  if (!HTMLImageElement.prototype.decode) Object.defineProperty(HTMLImageElement.prototype, "decode", { value: async () => {}, configurable: true });
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue(undefined);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { queueMicrotask(() => callback(0)); return 1; });
  surface = document.createElement("div"); document.body.append(surface);
  sync = createSurfaceSync("guest", surface, vi.fn());
});
afterEach(() => { sync.dispose(); surface.remove(); vi.restoreAllMocks(); });

it("blocks input before capture, installs a decoded preview, then covers the same live guest", async () => {
  let resolve!: (image: WebSnapshot) => void;
  ipc.capture.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  sync.update(intent(true)); await flush();
  expect(ipc.sync.mock.lastCall?.[1]).toMatchObject({ visible: true, inputBlocked: true, covered: false });
  expect(surface.querySelector("img")).toBeNull();
  resolve(snapshot); await flush();
  expect(surface.querySelector("img")?.src).toContain(snapshot.png);
  expect(ipc.sync.mock.lastCall?.[1]).toMatchObject({ visible: true, inputBlocked: true, covered: true });
  sync.update(intent(true)); await flush();
  expect(ipc.capture).toHaveBeenCalledTimes(1);
  sync.update(intent(false)); await flush();
  expect(ipc.sync.mock.lastCall?.[1]).toMatchObject({ visible: true, inputBlocked: false, covered: false });
  expect(surface.childElementCount).toBe(0);
});

it("cancels pending capture without delaying modal dismissal and ignores the stale image", async () => {
  let resolve!: (image: WebSnapshot) => void;
  ipc.capture.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  sync.update(intent(true)); await flush();
  sync.update(intent(false)); await flush();
  expect(ipc.sync.mock.lastCall?.[1].inputBlocked).toBe(false);
  resolve(snapshot); await flush();
  expect(surface.childElementCount).toBe(0);
  expect(ipc.sync.mock.lastCall?.[1].covered).toBe(false);
});

it("uses a bounded fallback on failed capture without exposing an interactive guest", async () => {
  ipc.capture.mockRejectedValueOnce(new Error("timeout"));
  sync.update(intent(true)); await flush();
  expect(surface.textContent).toBe("网页预览暂不可用");
  expect(ipc.sync.mock.lastCall?.[1]).toMatchObject({ visible: true, inputBlocked: true, covered: true });
  sync.update(intent(true)); await flush();
  expect(ipc.capture).toHaveBeenCalledTimes(1);
});

it("retains coverage across navigation and discards previews immediately when locked or inactive", async () => {
  sync.update(intent(true)); await flush();
  let resolve!: (image: WebSnapshot) => void;
  ipc.capture.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  sync.update(intent(true, 2)); await flush();
  expect(ipc.sync.mock.lastCall?.[1].covered).toBe(true);
  expect(surface.querySelector("img")).toBeNull();
  sync.update({ ...intent(false, 2), bounds: { ...intent(false).bounds, visible: false } });
  expect(surface.childElementCount).toBe(0);
  await flush(); resolve(snapshot); await flush();
  expect(ipc.sync.mock.lastCall?.[1]).toMatchObject({ visible: false, covered: false });
  expect(surface.childElementCount).toBe(0);
});

it("coalesces writes and restores only the latest geometry after a delayed native acknowledgement", async () => {
  let resolve!: () => void;
  ipc.sync.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  sync.update(intent(true));
  sync.update({ ...intent(false), bounds: { ...intent(false).bounds, width: 700 } });
  expect(ipc.sync).toHaveBeenCalledTimes(1);
  resolve(); await flush();
  expect(ipc.capture).not.toHaveBeenCalled();
  expect(ipc.sync.mock.lastCall?.[1]).toMatchObject({ width: 700, covered: false, inputBlocked: false });
});

it("does not let a stale decode undo a newer modal preview", async () => {
  let resolve!: () => void;
  vi.mocked(HTMLImageElement.prototype.decode).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  sync.update(intent(true)); await flush();
  sync.update(intent(true, 2)); await flush();
  expect(ipc.capture).toHaveBeenCalledTimes(1);
  resolve(); await flush();
  expect(surface.querySelector("img")).not.toBeNull();
  expect(ipc.sync.mock.lastCall?.[1].covered).toBe(true);
});

it("serializes snapshots and coalesces repeated modal resizes without blocking restoration", async () => {
  let resolve!: (image: WebSnapshot) => void;
  ipc.capture.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  sync.update(intent(true)); await flush();
  for (const width of [450, 500, 550, 600]) {
    sync.update({ ...intent(true), bounds: { ...intent(true).bounds, width } }); await flush();
  }
  expect(ipc.capture).toHaveBeenCalledTimes(1);
  resolve(snapshot); await flush();
  expect(ipc.capture).toHaveBeenCalledTimes(2);
  expect(ipc.sync.mock.lastCall?.[1]).toMatchObject({ width: 600, covered: true });
});

it("does not capture the previous document during an initial load or same-URL reload", async () => {
  sync.update({ ...intent(true), snapshotReady: false }); await flush();
  expect(ipc.capture).not.toHaveBeenCalled();
  expect(surface.querySelector("img")).toBeNull();
  expect(ipc.sync.mock.lastCall?.[1]).toMatchObject({ covered: true, inputBlocked: true });
  sync.update({ ...intent(true, 2), snapshotReady: true }); await flush();
  expect(ipc.capture).toHaveBeenCalledTimes(1);
  expect(surface.querySelector("img")).not.toBeNull();
});
