import { dataLease, dataPaused, subscribeDataAccess } from "./dataAccess";
import { api } from "./http";
import { createVaultStatusObserver } from "./services/vaultStatusObserver";
import type { VaultStatus } from "../lib/contracts/credentials";

export const vaultStatus = createVaultStatusObserver(() => api<VaultStatus>("/vault"), { paused: dataPaused, subscribe: subscribeDataAccess });
export async function readVaultStatus() {
  const lease = dataLease();
  const status = await vaultStatus.read();
  lease.check();
  return status;
}
