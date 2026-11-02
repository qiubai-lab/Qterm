import { useCallback, useEffect, useRef, useState } from "react";
import { lockVault, unlockVault } from "@qterm/services/credentials";

export interface TerminalLockBackend {
  read: () => Promise<{ locked: boolean }>;
  lock: () => Promise<{ locked: boolean }>;
  unlock: (password: string) => Promise<{ locked: boolean }>;
}

/** Desktop locks last for this mount; Web locks are restored from its login session. */
export function useTerminalLock(backend?: TerminalLockBackend) {
  const [phase, setPhase] = useState<"checking" | "locked" | "unlocked">(backend ? "checking" : "unlocked");
  const [error, setError] = useState("");
  const revision = useRef(0);
  const readState = useCallback(async () => {
    if (!backend) return;
    const request = ++revision.current;
    try {
      const state = await backend.read();
      if (request === revision.current) setPhase(state.locked ? "locked" : "unlocked");
    } catch {
      if (request === revision.current) setError("无法确认终端锁定状态，请重试。");
    }
  }, [backend]);

  const restore = useCallback(() => {
    setPhase("checking");
    setError("");
    return readState();
  }, [readState]);

  useEffect(() => {
    let disposed = false;
    const initialRevision = revision.current;
    queueMicrotask(() => { if (!disposed && backend && revision.current === initialRevision) void readState(); });
    return () => { disposed = true; revision.current += 1; };
  }, [backend, readState]);

  const lock = useCallback(async (vaultUnlocked: boolean) => {
    const request = ++revision.current;
    if (backend) { setPhase("checking"); setError(""); }
    try {
      if (backend) {
        const state = await backend.lock();
        if (!state.locked) throw new Error("终端锁定未完成，请重试");
      } else if (vaultUnlocked) await lockVault();
      if (request === revision.current) setPhase("locked");
    } catch (reason) {
      // A lost response can hide a successful mutation. Reconcile before exposing
      // the workbench, and remain covered if that read also fails.
      if (backend && request === revision.current) await restore();
      throw reason;
    }
  }, [backend, restore]);

  const unlock = useCallback(async (password: string) => {
    const request = ++revision.current;
    if (backend) {
      const state = await backend.unlock(password);
      if (state.locked) throw new Error("终端仍处于锁定状态，请重试");
    } else await unlockVault(password);
    if (request === revision.current) setPhase("unlocked");
  }, [backend]);

  return { locked: phase !== "unlocked", checking: phase === "checking", error, restore, lock, unlock };
}
