import { onVaultStatusChanged, type VaultStatusChanged } from "../../../lib/tauri/credentials";

/** Observe current-vault changes without treating a successful unlock as a lock. */
export function observeCredentialVault({ refreshInitial, refresh, onLocked, onError }: {
  refreshInitial: () => Promise<void>;
  refresh: () => Promise<void>;
  onLocked: (event: VaultStatusChanged) => void;
  onError: (error: unknown) => void;
}) {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  const report = (error: unknown) => { if (!disposed) onError(error); };
  queueMicrotask(() => { if (!disposed) void refreshInitial().catch(report); });
  void onVaultStatusChanged((event) => {
    if (disposed) return;
    if (event.unlocked) void refresh().catch(report);
    else onLocked(event);
  }).then((value) => { if (disposed) value(); else unlisten = value; }).catch(() => undefined);
  return () => { disposed = true; unlisten?.(); };
}
