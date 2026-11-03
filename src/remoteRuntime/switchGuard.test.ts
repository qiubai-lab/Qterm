import { expect, it, vi } from "vitest";
import { flushRuntime, registerRuntimeFlush, registerRuntimeDetach, detachRuntime, assertRuntimeAttached } from "./switchGuard";
it("propagates a failed save without detaching any active runtime", async () => {
  const stop=registerRuntimeFlush(async()=>{throw new Error("conflict");}); const detach=vi.fn(); const remove=registerRuntimeDetach(detach);
  try { await expect(flushRuntime()).rejects.toThrow("conflict"); expect(detach).not.toHaveBeenCalled(); }
  finally {stop();remove();}
});
it("unregisters closed surfaces before subsequent environment changes", async () => {
  const flush=vi.fn(),detach=vi.fn(); const stop=registerRuntimeFlush(flush), remove=registerRuntimeDetach(detach);
  stop();remove(); await flushRuntime();await detachRuntime();expect(flush).not.toHaveBeenCalled();expect(detach).not.toHaveBeenCalled();
});

it("blocks auto-reconnect during detach and releases the guard on failure", async () => {
  let fail!: (error: Error) => void;
  const stop=registerRuntimeDetach(()=>new Promise<void>((_resolve,reject)=>{fail=reject;}));
  const pending=detachRuntime();
  expect(()=>assertRuntimeAttached()).toThrow("正在切换运行环境");
  fail(new Error("cleanup failed"));
  await expect(pending).rejects.toThrow("cleanup failed");
  expect(()=>assertRuntimeAttached()).not.toThrow();stop();
});
