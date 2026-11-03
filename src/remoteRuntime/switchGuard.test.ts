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

it("stops later cleanup and releases the detach guard after an expired switch settles", async () => {
  const controller = new AbortController();
  let finish!: () => void;
  const removeFirst = registerRuntimeDetach(() => new Promise<void>(resolve => { finish = resolve; }));
  const later = vi.fn(); const removeLater = registerRuntimeDetach(later);
  try {
    const pending = detachRuntime(controller.signal);
    controller.abort(new Error("expired"));
    finish();
    await expect(pending).rejects.toThrow("expired");
    expect(later).not.toHaveBeenCalled();
    expect(() => assertRuntimeAttached()).not.toThrow();
  } finally { removeFirst(); removeLater(); }
});

it("runs each cleanup once when a React effect re-registers it during an awaited close", async () => {
  const registrations: (() => void)[] = [];
  let calls = 0;
  const cleanup = async () => {
    calls += 1;
    // A native IPC await lets React commit the cleared workspace state. Its
    // effect removes the old callback and registers a new closure.
    await Promise.resolve();
    registrations[registrations.length - 1]?.();
    if (calls < 4) registrations.push(registerRuntimeDetach(() => cleanup()));
  };
  registrations.push(registerRuntimeDetach(cleanup));
  try {
    await detachRuntime();
    expect(calls).toBe(1);
  } finally { registrations.forEach(remove => remove()); }
});

it("uses replacement callbacks on the next attempt after a cleanup failure", async () => {
  const replacement = vi.fn().mockResolvedValue(undefined);
  let removeReplacement = () => {};
  const removeFirst = registerRuntimeDetach(async () => {
    removeFirst();
    removeReplacement = registerRuntimeDetach(replacement);
    throw new Error("native close failed");
  });
  try {
    await expect(detachRuntime()).rejects.toThrow("native close failed");
    expect(replacement).not.toHaveBeenCalled();
    expect(() => assertRuntimeAttached()).not.toThrow();
    await detachRuntime();
    expect(replacement).toHaveBeenCalledOnce();
  } finally { removeFirst(); removeReplacement(); }
});
