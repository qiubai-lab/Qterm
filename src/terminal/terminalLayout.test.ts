import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTerminalLayout } from "./terminalLayout";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function harness(conpty = true) {
  let dimensions = { cols: 80, rows: 24 };
  const drain: Array<() => void> = [];
  const terminal = {
    cols: 80, rows: 24,
    options: { windowsPty: conpty ? { backend: "conpty" as const } : {} },
    write: vi.fn((_data: string, callback: () => void) => drain.push(callback)),
    refresh: vi.fn(),
  };
  const fit = { proposeDimensions: () => dimensions, fit: vi.fn(() => Object.assign(terminal, dimensions)) };
  const send = vi.fn().mockResolvedValue(undefined);
  const layout = createTerminalLayout(terminal, fit, send);
  return { terminal, fit, send, layout, drain, size: (cols: number, rows: number) => { dimensions = { cols, rows }; } };
}

it("keeps the Windows grid stable during dragging and drains received output before applying the final size", async () => {
  const h = harness();
  for (const rows of [18, 10, 6, 8, 16]) {
    h.size(80, rows); h.layout.restore();
    await vi.advanceTimersByTimeAsync(30);
    expect(h.terminal.rows).toBe(24);
    expect(h.send).not.toHaveBeenCalled();
  }
  await vi.advanceTimersByTimeAsync(120);
  expect(h.terminal.rows).toBe(24);
  h.drain.shift()!();
  await vi.runAllTimersAsync();
  expect(h.terminal.rows).toBe(16);
  expect(h.send).toHaveBeenCalledExactlyOnceWith(80, 16);
  h.layout.dispose();
});

it("discards a stale drain callback when dragging resumes", async () => {
  const h = harness();
  h.size(80, 6); h.layout.restore();
  await vi.advanceTimersByTimeAsync(120);
  h.size(80, 18); h.layout.restore();
  h.drain.shift()!();
  expect(h.terminal.rows).toBe(24);
  await vi.advanceTimersByTimeAsync(120);
  h.drain.shift()!();
  await vi.runAllTimersAsync();
  expect(h.send).toHaveBeenCalledExactlyOnceWith(80, 18);
  h.layout.dispose();
});

it("cancels scheduled and draining layout changes on disposal", async () => {
  const h = harness();
  h.size(80, 6); h.layout.restore();
  await vi.advanceTimersByTimeAsync(120);
  h.layout.dispose(); h.drain.shift()!();
  await vi.runAllTimersAsync();
  expect(h.fit.fit).not.toHaveBeenCalled();
  expect(h.send).not.toHaveBeenCalled();
});

it("fits non-Windows terminals immediately, skips duplicates, and supports forced synchronization", async () => {
  const h = harness(false);
  h.size(100, 30); expect(h.layout.restore()).toBe(true);
  expect(h.terminal.cols).toBe(100);
  expect(h.terminal.write).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  h.layout.restore(); await vi.runAllTimersAsync();
  expect(h.send).toHaveBeenCalledOnce();
  h.layout.restore(true); await vi.runAllTimersAsync();
  expect(h.send).toHaveBeenCalledTimes(2);
  h.layout.dispose();
});

it("rejects zero-sized measurements without touching the terminal", () => {
  const h = harness();
  h.size(0, 0); expect(h.layout.restore()).toBe(false);
  expect(h.fit.fit).not.toHaveBeenCalled();
  h.layout.dispose();
});

it("preserves a forced Windows reconnect sync through later measurements", async () => {
  const h = harness();
  h.layout.restore(); await vi.advanceTimersByTimeAsync(120);
  h.drain.shift()!(); await vi.runAllTimersAsync();
  h.layout.restore(true); h.layout.restore();
  await vi.advanceTimersByTimeAsync(120);
  h.drain.shift()!(); await vi.runAllTimersAsync();
  expect(h.send).toHaveBeenCalledTimes(2);
  h.layout.dispose();
});
