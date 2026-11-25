import { afterEach, expect, it, vi } from "vitest";
import { createSessionInventory } from "./sessionInventory";
import { pauseData, resumeData } from "./dataAccess";
import type { RetainedSession } from "../lib/tauri/runtimeSessions";

afterEach(() => { resumeData(); vi.useRealTimers(); });

it("shares a recovery read across workspaces, refreshes mutated blocks and never caches management reads", async () => {
  const read = vi.fn(async (): Promise<RetainedSession[]> => []);
  const inventory = createSessionInventory(read);
  await Promise.all([inventory.list({ blockId: "a" }), inventory.list({ blockIds: ["b"] })]);
  await inventory.list({ blockId: "b" });
  expect(read).toHaveBeenCalledOnce();
  inventory.changed("a");
  await inventory.list({ blockIds: ["b"] });
  await inventory.list({ blockId: "a" });
  await inventory.list();
  expect(read).toHaveBeenCalledTimes(3);
});

it("retries failures and discards in-flight results from a revoked login lifetime", async () => {
  let release!: () => void;
  const read = vi.fn<() => Promise<RetainedSession[]>>()
    .mockImplementationOnce(() => new Promise(resolve => { release = () => resolve([]); }))
    .mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
  const inventory = createSessionInventory(read);
  const old = inventory.list({ blockId: "a" });
  pauseData(); resumeData();
  release();
  await expect(old).rejects.toThrow();
  await expect(inventory.list({ blockId: "a" })).rejects.toThrow("offline");
  await expect(inventory.list({ blockId: "a" })).resolves.toEqual([]);
  expect(read).toHaveBeenCalledTimes(3);
});
