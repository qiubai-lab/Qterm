import { expect, it, vi } from "vitest";
import { runRuntimeSwitch } from "./switchOperation";

it("times out without committing a late completion or overlapping native work", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const commit = vi.fn(), next = vi.fn();
  const pending = runRuntimeSwitch([
    { label: "保存", run: () => new Promise<void>(resolve => { finish = resolve; }) },
    { label: "连接", run: next },
  ], vi.fn(), commit, 100);
  const rejected = expect(pending).rejects.toThrow("保存超时");
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  await expect(runRuntimeSwitch([], vi.fn(), commit)).rejects.toThrow("仍在清理");
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(next).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  await runRuntimeSwitch([], vi.fn(), commit);
  expect(commit).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it("reports stages and stops at a failed operation", async () => {
  const stage = vi.fn(), commit = vi.fn();
  await expect(runRuntimeSwitch([
    { label: "保存", run: async () => {} },
    { label: "连接", run: async () => { throw new Error("unavailable"); } },
  ], stage, commit)).rejects.toThrow("unavailable");
  expect(stage.mock.calls).toEqual([["保存"], ["连接"]]);
  expect(commit).not.toHaveBeenCalled();
});
