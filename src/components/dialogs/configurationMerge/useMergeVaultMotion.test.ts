import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMergeVaultMotion } from "./useMergeVaultMotion";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("keeps the current stage through its exit, then enters the source stage once", () => {
  const complete = vi.fn();
  const { result } = renderHook(useMergeVaultMotion);
  act(() => { result.current.advance(complete); result.current.advance(complete); });
  expect(result.current.motion).toBe("leaving");
  act(() => vi.advanceTimersByTime(89));
  expect(complete).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(complete).toHaveBeenCalledTimes(1);
  expect(result.current.motion).toBe("entering");
});

it("retains the dialog during exit and completes only once", () => {
  const complete = vi.fn();
  const { result } = renderHook(useMergeVaultMotion);
  act(() => { result.current.closeWithTransition(complete); result.current.closeWithTransition(complete); });
  expect(result.current.closing).toBe(true);
  act(() => vi.advanceTimersByTime(129));
  expect(complete).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(complete).toHaveBeenCalledTimes(1);
});

it("does not delay switching or closing when reduced motion is enabled", () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  const advance = vi.fn();
  const close = vi.fn();
  const { result } = renderHook(useMergeVaultMotion);
  act(() => { result.current.advance(advance); result.current.closeWithTransition(close); });
  expect(advance).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(result.current.motion).toBe("idle");
  expect(result.current.closing).toBe(false);
});

it("cancels pending callbacks when the parent unmounts", () => {
  const advance = vi.fn();
  const close = vi.fn();
  const { result, unmount } = renderHook(useMergeVaultMotion);
  act(() => { result.current.advance(advance); result.current.closeWithTransition(close); });
  unmount();
  act(() => vi.runAllTimers());
  expect(advance).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
