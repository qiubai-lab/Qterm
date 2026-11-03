import type * as Desktop from "../../lib/tauri/credentials";

// The public demo has no credential vault and must never invoke native credential APIs.
export const getVaultStatus: typeof Desktop.getVaultStatus = async () => ({
  initialized: false, unlocked: false, legacy: false,
});
export const lockVault: typeof Desktop.lockVault = async () => {
  throw new Error("演示环境不支持凭证保险库操作");
};
