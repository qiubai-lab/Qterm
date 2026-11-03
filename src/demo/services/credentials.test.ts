import { expect, it, vi } from "vitest";
import { getVaultStatus, lockVault } from "./credentials";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

it("reports no demo vault and rejects vault mutations without native calls", async () => {
  expect(await getVaultStatus()).toEqual({ initialized: false, unlocked: false, legacy: false });
  await expect(lockVault()).rejects.toThrow("演示环境不支持凭证保险库操作");
  expect(invoke).not.toHaveBeenCalled();
});
