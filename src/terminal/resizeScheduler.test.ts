import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createResizeScheduler } from "./resizeScheduler";

describe("terminal resize scheduler", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("coalesces a resize burst to the latest dimensions and skips duplicates", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const scheduler = createResizeScheduler(send, 50);

    scheduler.request(80, 24);
    scheduler.request(100, 30);
    scheduler.request(100, 30);
    await vi.advanceTimersByTimeAsync(50);

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(100, 30);

    scheduler.request(100, 30);
    await vi.advanceTimersByTimeAsync(50);
    expect(send).toHaveBeenCalledOnce();
    scheduler.dispose();
  });

  it("serializes in-flight work and only sends the newest pending dimensions", async () => {
    const completions: Array<() => void> = [];
    const send = vi.fn(() => new Promise<void>((resolve) => completions.push(resolve)));
    const scheduler = createResizeScheduler(send, 50);

    scheduler.request(80, 24);
    await vi.advanceTimersByTimeAsync(50);
    expect(send).toHaveBeenCalledWith(80, 24);

    scheduler.request(90, 28);
    scheduler.request(120, 40);
    expect(send).toHaveBeenCalledOnce();

    completions.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenNthCalledWith(2, 120, 40);
    scheduler.dispose();
  });

  it("allows the same dimensions to be retried after a send failure", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("temporary resize failure"))
      .mockResolvedValue(undefined);
    const scheduler = createResizeScheduler(send, 50);

    scheduler.request(100, 30);
    await vi.advanceTimersByTimeAsync(50);
    scheduler.request(100, 30);
    await vi.advanceTimersByTimeAsync(50);

    expect(send).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it("force-sends the same dimensions for a newly connected session", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const scheduler = createResizeScheduler(send, 50);

    scheduler.request(100, 30);
    await vi.advanceTimersByTimeAsync(50);
    scheduler.request(100, 30, true);
    await vi.advanceTimersByTimeAsync(50);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, 100, 30);
    scheduler.dispose();
  });

  it("keeps a forced same-size request pending behind an in-flight resize", async () => {
    const completions: Array<() => void> = [];
    const send = vi.fn(() => new Promise<void>((resolve) => completions.push(resolve)));
    const scheduler = createResizeScheduler(send, 0);

    scheduler.request(80, 24);
    await vi.advanceTimersByTimeAsync(0);
    scheduler.request(80, 24, true);
    completions.shift()?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, 80, 24);
    scheduler.dispose();
  });
});
