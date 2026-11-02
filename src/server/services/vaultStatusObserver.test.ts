import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VaultStatus } from "../../lib/contracts/credentials";
import { createVaultStatusObserver } from "./vaultStatusObserver";

const empty = { initialized: false, unlocked: false, legacy: false };
const locked = { ...empty, initialized: true };
const unlocked = { ...locked, unlocked: true };
const stops: Array<() => void> = [];

function deferred() {
  let resolve!: (status: VaultStatus) => void;
  const promise = new Promise<VaultStatus>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { stops.splice(0).forEach((stop) => stop()); vi.useRealTimers(); });

it.each([empty, locked, unlocked])("does not broadcast initial or unchanged snapshots (%j)", async (status) => {
  const load = vi.fn().mockResolvedValue(status);
  const listener = vi.fn();
  const observer = createVaultStatusObserver(load);
  stops.push(observer.subscribe(listener));
  await vi.advanceTimersByTimeAsync(6000);
  expect(load).toHaveBeenCalledTimes(4);
  expect(listener).not.toHaveBeenCalled();
});

it("shares polling and broadcasts each real transition once to all listeners", async () => {
  const load = vi.fn().mockResolvedValue(empty);
  const observer = createVaultStatusObserver(load);
  const first = vi.fn(), second = vi.fn();
  stops.push(observer.subscribe(first), observer.subscribe(second));
  await vi.advanceTimersByTimeAsync(0);
  for (const status of [unlocked, locked, empty, { ...empty, legacy: true }]) {
    load.mockResolvedValue(status);
    await vi.advanceTimersByTimeAsync(4000);
    expect(first).toHaveBeenLastCalledWith({ ...status, reason: "manual" });
    expect(second).toHaveBeenLastCalledWith({ ...status, reason: "manual" });
  }
  expect(first).toHaveBeenCalledTimes(4);
  expect(second).toHaveBeenCalledTimes(4);
  expect(load).toHaveBeenCalledTimes(9);
});

it("notifies explicit mutations immediately even for an unchanged status", async () => {
  const listener = vi.fn();
  const observer = createVaultStatusObserver(vi.fn().mockResolvedValue(locked));
  stops.push(observer.subscribe(listener));
  await vi.advanceTimersByTimeAsync(0);
  await observer.refreshAfterMutation();
  expect(listener).toHaveBeenCalledExactlyOnceWith({ ...locked, reason: "manual" });
  await vi.advanceTimersByTimeAsync(4000);
  expect(listener).toHaveBeenCalledTimes(1);
});

it("does not replay an older locked response after a successful unlock notification", async () => {
  const pending = deferred();
  const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(unlocked);
  const listener = vi.fn();
  const observer = createVaultStatusObserver(load);
  stops.push(observer.subscribe(listener));
  await observer.refreshAfterMutation();
  pending.resolve(locked);
  await vi.advanceTimersByTimeAsync(4000);
  expect(listener).toHaveBeenCalledExactlyOnceWith({ ...unlocked, reason: "manual" });
});

it("retains the baseline after a failed poll and observes a later lock", async () => {
  const load = vi.fn().mockResolvedValueOnce(unlocked).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(locked);
  const listener = vi.fn();
  stops.push(createVaultStatusObserver(load).subscribe(listener));
  await vi.advanceTimersByTimeAsync(2000);
  expect(listener).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(listener).toHaveBeenCalledExactlyOnceWith({ ...locked, reason: "manual" });
});

it("waits for slow polls instead of starting overlapping requests", async () => {
  const pending = deferred();
  const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(unlocked);
  const listener = vi.fn();
  stops.push(createVaultStatusObserver(load).subscribe(listener));
  await vi.advanceTimersByTimeAsync(6000);
  expect(load).toHaveBeenCalledTimes(1);
  pending.resolve(locked);
  await vi.advanceTimersByTimeAsync(2000);
  expect(listener).toHaveBeenCalledExactlyOnceWith({ ...unlocked, reason: "manual" });
});

it("stops polling after the last unsubscribe and ignores replies from a previous subscription", async () => {
  const pending = deferred();
  const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(locked);
  const observer = createVaultStatusObserver(load);
  const oldListener = vi.fn(), newListener = vi.fn();
  const stop = observer.subscribe(oldListener);
  stop();
  await vi.advanceTimersByTimeAsync(4000);
  expect(load).toHaveBeenCalledTimes(1);
  stops.push(observer.subscribe(newListener));
  await vi.advanceTimersByTimeAsync(0);
  pending.resolve(unlocked);
  await vi.advanceTimersByTimeAsync(4000);
  expect(oldListener).not.toHaveBeenCalled();
  expect(newListener).not.toHaveBeenCalled();
});

it("stops polling while the workbench is locked and resynchronizes once on unlock",async()=>{
  let paused=false,changed=()=>{};
  const load=vi.fn().mockResolvedValue(unlocked),listener=vi.fn();
  const observer=createVaultStatusObserver(load,{paused:()=>paused,subscribe:callback=>{changed=callback;return()=>{};}});
  stops.push(observer.subscribe(listener));await vi.advanceTimersByTimeAsync(0);load.mockClear();
  paused=true;changed();await vi.advanceTimersByTimeAsync(30000);
  expect(load).not.toHaveBeenCalled();
  paused=false;changed();await vi.advanceTimersByTimeAsync(0);
  expect(load).toHaveBeenCalledOnce();expect(listener).toHaveBeenCalledExactlyOnceWith({...unlocked,reason:"manual"});
});
