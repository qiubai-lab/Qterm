import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GitSnapshot } from "../lib/tauri/git";
import { useGitSnapshotRefresh } from "./useGitSnapshotRefresh";
const source = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock("@qterm/services/gitObservation", () => ({ supportsGitObservation: true, subscribeGitObservation: source.subscribe }));
let notify: (read: () => Promise<GitSnapshot>) => void;
const stop = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  source.subscribe.mockImplementation((_target, listener) => { notify = listener; return stop; });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("queues the latest invalidation through a mutation and another read, and releases inactive subscriptions", async () => {
  let done!: (result: boolean) => void;
  const refresh = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { done = resolve; })).mockResolvedValue(true);
  const a = vi.fn(), b = vi.fn(), c = vi.fn();
  const { rerender, unmount } = renderHook(({ busy, enabled }) => useGitSnapshotRefresh({ path: "/repo", remote: false, profileId: null, busy, enabled, refresh }), { initialProps: { busy: true, enabled: true } });
  act(() => { notify(a); notify(b); }); expect(refresh).not.toHaveBeenCalled();
  rerender({ busy: false, enabled: true });
  await refresh.mock.calls[0][1](); expect(b).toHaveBeenCalledOnce(); expect(a).not.toHaveBeenCalled();
  act(() => notify(c));
  await act(async () => { done(true); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  await refresh.mock.calls[1][1](); expect(c).toHaveBeenCalledOnce();
  rerender({ busy: false, enabled: false }); expect(stop).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); }); expect(refresh).toHaveBeenCalledTimes(2);
  rerender({ busy: false, enabled: true }); expect(source.subscribe).toHaveBeenCalledTimes(2);
  unmount(); expect(stop).toHaveBeenCalledTimes(2);
});
it("releases hidden-page observation and resubscribes when visible", () => {
  const { unmount } = renderHook(() => useGitSnapshotRefresh({ path: "/repo", remote: false, profileId: null, busy: false, enabled: true, refresh: vi.fn() }));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange"))); expect(stop).toHaveBeenCalledTimes(1);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange"))); expect(source.subscribe).toHaveBeenCalledTimes(2);
  unmount();
});

it.each([
  { code: "notGitRepository" },
  { code: "gitMissing" },
  { code: "invalidGitPath" },
  { code: "gitUnsupportedRemote" },
  { code: "other", retryable: false },
])("stops retrying permanent failure %j and accepts a new repository revision", async error => {
  const refresh = vi.fn(async (_clear?: boolean, read?: () => Promise<GitSnapshot>) => {
    try { await read?.(); return true; } catch { return false; }
  });
  const { rerender, unmount } = renderHook(({ busy }) => useGitSnapshotRefresh({ path: "/repo", remote: false, profileId: null, enabled: true, busy, refresh }), { initialProps: { busy: false } });
  let reject!: (error: unknown) => void;
  const failed = vi.fn(() => new Promise<GitSnapshot>((_resolve, fail) => { reject = fail; }));
  act(() => notify(failed));
  rerender({ busy: true });
  await act(async () => reject(error));
  rerender({ busy: false });
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(failed).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledOnce();
  const initialized = vi.fn().mockResolvedValue({ repositoryPath: "/repo" });
  await act(async () => notify(initialized));
  expect(initialized).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledTimes(2);
  unmount();
});

it("waits for backoff despite busy clearing, and cancels retries when disabled", async () => {
  let reject!: (error: unknown) => void;
  const read = vi.fn(() => new Promise<GitSnapshot>((_resolve, fail) => { reject = fail; }));
  const refresh = vi.fn(async (_clear?: boolean, loader?: () => Promise<GitSnapshot>) => {
    try { await loader?.(); return true; } catch { return false; }
  });
  const { rerender, unmount } = renderHook(({ busy, enabled }) => useGitSnapshotRefresh({ path: "/repo", remote: false, profileId: null, busy, enabled, refresh }), { initialProps: { busy: false, enabled: true } });
  act(() => notify(read));
  for (let attempt = 1; attempt <= 3; attempt++) {
    rerender({ busy: true, enabled: true });
    await act(async () => reject(new Error("network unavailable")));
    rerender({ busy: false, enabled: true });
    expect(read).toHaveBeenCalledTimes(attempt);
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(read).toHaveBeenCalledTimes(attempt);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(read).toHaveBeenCalledTimes(attempt + 1);
  }
  await act(async () => reject(new Error("network unavailable")));
  rerender({ busy: false, enabled: false });
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(read).toHaveBeenCalledTimes(4);
  unmount();
});

it("keeps a newer invalidation through a failed read without leaving a duplicate retry", async () => {
  let reject!: (error: unknown) => void;
  const oldRead = vi.fn(() => new Promise<GitSnapshot>((_resolve, fail) => { reject = fail; }));
  const newRead = vi.fn().mockResolvedValue({ repositoryPath: "/repo" });
  const refresh = vi.fn(async (_clear?: boolean, loader?: () => Promise<GitSnapshot>) => {
    try { await loader?.(); return true; } catch { return false; }
  });
  const { rerender, unmount } = renderHook(({ busy }) => useGitSnapshotRefresh({ path: "/repo", remote: false, profileId: null, busy, enabled: true, refresh }), { initialProps: { busy: false } });
  act(() => notify(oldRead));
  rerender({ busy: true });
  act(() => notify(newRead));
  await act(async () => reject({ code: "notGitRepository" }));
  await act(async () => rerender({ busy: false }));
  expect(newRead).toHaveBeenCalledOnce();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(refresh).toHaveBeenCalledTimes(2);
  unmount();
});
