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
  rerender({ busy: false, enabled: true }); expect(refresh).toHaveBeenLastCalledWith(true, b);
  act(() => notify(c));
  await act(async () => { done(true); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(refresh).toHaveBeenLastCalledWith(true, c);
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
