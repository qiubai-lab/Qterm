import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNativeWebDismiss } from "./useNativeWebDismiss";

const native = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("../lib/tauri/web", () => ({ listenWebFocus: native.listen }));
afterEach(() => vi.resetAllMocks());

it("uses the latest dismiss callback and releases a late native subscription after closing", async () => {
  let receive!: () => void, resolve!: (stop: () => void) => void;
  native.listen.mockImplementation(callback => { receive = callback; return new Promise(stop => { resolve = stop; }); });
  const first = vi.fn(), latest = vi.fn(), stop = vi.fn();
  const hook = renderHook(({ open, dismiss }) => useNativeWebDismiss(open, dismiss), { initialProps: { open: false, dismiss: first } });
  expect(native.listen).not.toHaveBeenCalled();
  hook.rerender({ open: true, dismiss: first });
  hook.rerender({ open: true, dismiss: latest });
  act(() => receive());
  expect(latest).toHaveBeenCalledOnce(); expect(first).not.toHaveBeenCalled();
  hook.rerender({ open: false, dismiss: latest });
  await act(async () => resolve(stop));
  expect(stop).toHaveBeenCalledOnce();
  act(() => receive());
  expect(latest).toHaveBeenCalledOnce();
  expect(native.listen).toHaveBeenCalledOnce();
});

it("tolerates unavailable native IPC on browser-only surfaces", async () => {
  native.listen.mockRejectedValue(new Error("no native host"));
  const dismiss = vi.fn();
  const hook = renderHook(() => useNativeWebDismiss(true, dismiss));
  await act(async () => {});
  expect(dismiss).not.toHaveBeenCalled();
  hook.unmount();
});
