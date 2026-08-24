import { describe, expect, it, vi } from "vitest";

import { createTerminalInputScheduler } from "./terminalInputScheduler";

describe("terminal input scheduler", () => {
  it("keeps input emitted after an async paste reservation behind the pasted data", async () => {
    let releaseClipboard!: () => void;
    const clipboardReady = new Promise<void>((resolve) => { releaseClipboard = resolve; });
    const writes: string[] = [];
    const scheduler = createTerminalInputScheduler(async (data) => { writes.push(data); });

    const paste = scheduler.runExclusive(async (capture) => {
      await clipboardReady;
      await capture(() => { void scheduler.send("pasted"); });
    });
    const laterInput = scheduler.send("\x03");

    expect(writes).toEqual([]);
    releaseClipboard();
    await Promise.all([paste, laterInput]);

    expect(writes).toEqual(["pasted", "\x03"]);
  });

  it("isolates a failed write so later terminal input still drains", async () => {
    const onError = vi.fn();
    const writer = vi.fn()
      .mockRejectedValueOnce(new Error("terminal busy"))
      .mockResolvedValue(undefined);
    const scheduler = createTerminalInputScheduler(writer, onError);

    await Promise.all([scheduler.send("first"), scheduler.send("second")]);

    expect(writer.mock.calls.map(([data]) => data)).toEqual(["first", "second"]);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("stops queued input after disposal", async () => {
    let releaseWrite!: () => void;
    const writer = vi.fn(() => new Promise<void>((resolve) => { releaseWrite = resolve; }));
    const scheduler = createTerminalInputScheduler(writer);

    const first = scheduler.send("first");
    const second = scheduler.send("second");
    await Promise.resolve();
    scheduler.dispose();
    releaseWrite();
    await Promise.all([first, second]);

    expect(writer).toHaveBeenCalledOnce();
    expect(writer).toHaveBeenCalledWith("first");
  });
});
