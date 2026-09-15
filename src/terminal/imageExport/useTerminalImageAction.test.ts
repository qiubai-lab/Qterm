import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTerminalImageAction } from "./useTerminalImageAction";

const mocks = vi.hoisted(() => ({ copy: vi.fn(), save: vi.fn() }));
vi.mock("../../lib/tauri/clipboard", () => ({ copyImageUrlToClipboard: mocks.copy }));
vi.mock("../../lib/tauri/terminalImage", () => ({ saveTerminalImage: mocks.save }));
const image = { blob: new Blob(), url: "blob:test", width: 100, height: 100, dispose: vi.fn() };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  mocks.copy.mockReset().mockResolvedValue(undefined);
  mocks.save.mockReset().mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("starts native work immediately but completes one circle before success, blocking duplicate actions", async () => {
  const { result } = renderHook(() => useTerminalImageAction(image, "test"));
  await act(async () => { void result.current.run("copy"); });
  expect(mocks.copy).toHaveBeenCalledOnce();
  expect(result.current.operation).toBe("copy");
  expect(result.current.feedback).toBeNull();
  await act(async () => { void result.current.run("save"); await vi.advanceTimersByTimeAsync(699); });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(result.current.feedback).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(result.current.operation).toBeNull();
  expect(result.current.feedback).toMatchObject({ action: "copy", error: false });
  await act(async () => { await vi.advanceTimersByTimeAsync(2400); });
  expect(result.current.feedback).toBeNull();
});

it("finishes the current revolution for slow work and keeps cancellation silent", async () => {
  let finish!: () => void;
  mocks.copy.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useTerminalImageAction(image, "test"));
  await act(async () => { void result.current.run("copy"); await vi.advanceTimersByTimeAsync(850); finish(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(549); });
  expect(result.current.operation).toBe("copy");
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(result.current.feedback?.error).toBe(false);
  await act(async () => { void result.current.run("save"); });
  await act(async () => { await vi.advanceTimersByTimeAsync(700); });
  expect(result.current.operation).toBeNull();
  expect(result.current.feedback).toBeNull();
});

it("cancels visual settling on close and skips it for reduced motion", async () => {
  const view = renderHook(() => useTerminalImageAction(image, "test"));
  await act(async () => { void view.result.current.run("copy"); });
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  const { result } = renderHook(() => useTerminalImageAction(image, "test"));
  await act(async () => { await result.current.run("copy"); });
  expect(result.current.operation).toBeNull();
  expect(result.current.feedback?.message).toBe("图片已复制");
});
