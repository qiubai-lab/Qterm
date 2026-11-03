import { expect, it, vi } from "vitest";
import { Terminal } from "@xterm/headless";
import { bindTerminalInput } from "./terminalInput";
import { createTerminalInputScheduler } from "./terminalInputScheduler";

it("forwards binary mouse bytes unchanged after reserved paste and disposes both listeners", async () => {
  const terminal = new Terminal();
  const write = vi.fn(async () => undefined);
  const scheduler = createTerminalInputScheduler(write);
  const binding = bindTerminalInput(terminal, scheduler);
  // Headless xterm has the same core event routing as the browser terminal.
  const core = (terminal as unknown as { _core: { coreService: {
    triggerBinaryEvent(data: string): void;
    triggerDataEvent(data: string): void;
  } } })._core.coreService;
  let release!: () => void;
  const paste = scheduler.runExclusive(async capture => {
    await new Promise<void>(resolve => { release = resolve; });
    await capture(() => core.triggerDataEvent("中文"));
  });
  await Promise.resolve();
  core.triggerBinaryEvent("\x1b[M\x20\xc8\xff");
  release();
  await paste;
  await scheduler.send("after");
  expect(write.mock.calls).toEqual([["中文"], [Uint8Array.from([27, 91, 77, 32, 200, 255])], ["after"]]);
  binding.dispose();
  core.triggerDataEvent("ignored");
  core.triggerBinaryEvent("ignored");
  await scheduler.send("end");
  expect(write).toHaveBeenCalledTimes(4);
  scheduler.dispose();
  terminal.dispose();
});
