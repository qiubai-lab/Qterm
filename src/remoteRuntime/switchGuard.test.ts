import { expect, it, vi } from "vitest";
import { flushRuntime, registerRuntimeFlush } from "./switchGuard";

it("propagates an unsaved draft and unregisters a closed editor", async () => {
  const stop = registerRuntimeFlush(async () => { throw new Error("conflict"); });
  try { await expect(flushRuntime()).rejects.toThrow("conflict"); } finally { stop(); }
  await expect(flushRuntime()).resolves.toBeUndefined();
});

it("flushes each participant only once when effects re-register during an awaited save", async () => {
  const replacement = vi.fn(async () => {});
  let remove = () => {};
  const stop = registerRuntimeFlush(async () => { stop(); remove = registerRuntimeFlush(replacement); });
  try { await flushRuntime(); expect(replacement).not.toHaveBeenCalled(); await flushRuntime(); expect(replacement).toHaveBeenCalledOnce(); }
  finally { stop(); remove(); }
});
