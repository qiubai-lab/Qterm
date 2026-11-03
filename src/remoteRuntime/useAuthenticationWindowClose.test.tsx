import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAuthenticationWindowClose } from "./useAuthenticationWindowClose";

const mocks = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock("../lib/tauri/window", () => ({ registerCurrentWindowCloseFlush: mocks.register }));

it("releases authentication close ownership when the workspace takes over", async () => {
  const stop = vi.fn();
  mocks.register.mockResolvedValue(stop);
  const view = renderHook(({enabled}) => useAuthenticationWindowClose(enabled), {initialProps:{enabled:true}});
  await act(async () => {});
  await expect(mocks.register.mock.calls[mocks.register.mock.calls.length - 1][0]()).resolves.toBeUndefined();
  view.rerender({enabled:false});
  expect(stop).toHaveBeenCalledOnce();
  view.unmount();
});

it("cleans up a listener that resolves after authentication unmounts", async () => {
  let resolve!: (stop: () => void) => void;
  mocks.register.mockImplementation(() => new Promise<() => void>(done => { resolve = done; }));
  const view = renderHook(() => useAuthenticationWindowClose(true));
  view.unmount();
  const stop = vi.fn();
  await act(async () => { resolve(stop); });
  expect(stop).toHaveBeenCalledOnce();
});
