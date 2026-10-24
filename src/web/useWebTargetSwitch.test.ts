import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useWebTargetSwitch } from "./useWebTargetSwitch";

it("keeps browsing unmounted until the latest selection finishes", async () => {
  const finishes: (() => void)[] = [];
  const select = vi.fn(() => new Promise<void>(resolve => finishes.push(resolve)));
  const hook = renderHook(() => useWebTargetSwitch("workspace", { type: "web", blockId: "web", profileId: "a" }, select));
  let first!: Promise<void>; let last!: Promise<void>;
  act(() => { first = hook.result.current.choose("b"); });
  act(() => { last = hook.result.current.choose("c"); });
  await act(async () => { finishes[0](); await first; });
  expect(hook.result.current.switching).toBe(true);
  await act(async () => { finishes[1](); await last; });
  expect(hook.result.current.switching).toBe(false);
  hook.unmount();
});
