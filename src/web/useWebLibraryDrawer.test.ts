import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWebLibraryDrawer } from "./useWebLibraryDrawer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("retains the drawer through exit and cancels removal when reopening", () => {
  const hook = renderHook(useWebLibraryDrawer);
  act(() => hook.result.current.show());
  expect(hook.result.current.phase).toBe("entering");
  act(() => vi.advanceTimersByTime(40));
  expect(hook.result.current.phase).toBe("open");
  act(() => hook.result.current.close());
  act(() => vi.advanceTimersByTime(90));
  expect(hook.result.current.present).toBe(true);
  act(() => hook.result.current.show());
  act(() => vi.advanceTimersByTime(200));
  expect(hook.result.current.phase).toBe("open");
  act(() => hook.result.current.close());
  act(() => vi.advanceTimersByTime(180));
  expect(hook.result.current.present).toBe(false);
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("opens and closes immediately under reduced motion", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const hook = renderHook(useWebLibraryDrawer);
  act(() => hook.result.current.show());
  expect(hook.result.current.phase).toBe("open");
  act(() => hook.result.current.close());
  expect(hook.result.current.phase).toBe("closed");
  hook.unmount();
});
