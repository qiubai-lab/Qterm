import { expect, it, vi } from "vitest";
import { runRuntimeSwitch } from "./switchOperation";

it("times out without committing a late completion or overlapping native work", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const commit = vi.fn(), next = vi.fn();
  const pending = runRuntimeSwitch([
    { label: "正在保存工作台…", timeoutMessage: "保存工作台超时，请重试", run: () => new Promise<void>(resolve => { finish = resolve; }) },
    { label: "连接", run: next },
  ], vi.fn(), commit, 100);
  const rejected = expect(pending).rejects.toThrow(/^保存工作台超时，请重试$/);
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  await expect(runRuntimeSwitch([], vi.fn(), commit)).rejects.toThrow("仍在结束");
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(next).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  await runRuntimeSwitch([], vi.fn(), commit);
  expect(commit).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it.each([0, 1, 2, 3])("cancels immediately in stage %s and never commits a late native completion", async index => {
  const controller = new AbortController();
  let finish!: () => void;
  let nativeSignal!: AbortSignal;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const stages = Array.from({ length: 4 }, (_, stage) => ({ label: String(stage), run: vi.fn(async (signal: AbortSignal) => {
    if (stage === index) {
      nativeSignal = signal; entered();
      await new Promise<void>(resolve => { finish = resolve; });
    }
  }) }));
  const commit = vi.fn();
  const pending = runRuntimeSwitch(stages, vi.fn(), commit, 30_000, { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await ready;
  controller.abort();
  await rejected;
  expect(nativeSignal.aborted).toBe(true);
  await expect(runRuntimeSwitch([], vi.fn(), commit)).rejects.toThrow("仍在结束");
  finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  stages.slice(index + 1).forEach(stage => expect(stage.run).not.toHaveBeenCalled());
  expect(commit).not.toHaveBeenCalled();
  await runRuntimeSwitch([], vi.fn(), commit);
  expect(commit).toHaveBeenCalledOnce();
});

it("does not start an already cancelled operation", async () => {
  const controller = new AbortController(); controller.abort();
  const run = vi.fn(); const commit = vi.fn();
  await expect(runRuntimeSwitch([{ label: "连接", run }], vi.fn(), commit, 30_000, { signal: controller.signal }))
    .rejects.toMatchObject({ name: "AbortError" });
  expect(run).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});

it("keeps new attempts blocked until cancelled connection resources finish closing", async () => {
  const controller = new AbortController();
  let finishConnect!: () => void;
  let finishCleanup!: () => void;
  const cleanup = vi.fn(() => new Promise<void>(resolve => { finishCleanup = resolve; }));
  const pending = runRuntimeSwitch([
    { label: "连接", run: () => new Promise<void>(resolve => { finishConnect = resolve; }) },
  ], vi.fn(), vi.fn(), 30_000, { signal: controller.signal, onAborted: cleanup });
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort(); await rejected;
  expect(cleanup).not.toHaveBeenCalled();
  finishConnect(); await Promise.resolve();
  expect(cleanup).toHaveBeenCalledOnce();
  await expect(runRuntimeSwitch([], vi.fn(), vi.fn())).rejects.toThrow("仍在结束");
  finishCleanup(); await new Promise(resolve => setTimeout(resolve, 0));
  await expect(runRuntimeSwitch([], vi.fn(), vi.fn())).resolves.toBeUndefined();
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
