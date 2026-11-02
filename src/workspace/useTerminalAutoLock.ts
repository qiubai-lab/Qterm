import { useEffect, useRef } from "react";
import type { VaultStatus } from "../lib/contracts/credentials";

/** Only user activity renews the terminal idle deadline; background output does not. */
export function useTerminalAutoLock(seconds: number | null | undefined, terminalLocked: boolean, vaultStatus: VaultStatus | null, onLock: () => Promise<boolean>) {
  const terminalLastActivityRef = useRef<number | null>(null);
  const previousTerminalLockedRef = useRef(false);
  useEffect(() => {
    terminalLastActivityRef.current = Date.now();
  }, [seconds]);

  useEffect(() => {
    if (previousTerminalLockedRef.current && !terminalLocked) terminalLastActivityRef.current = Date.now();
    previousTerminalLockedRef.current = terminalLocked;
  }, [terminalLocked]);

  useEffect(() => {
    if (seconds === null || seconds === undefined || terminalLocked || !vaultStatus?.initialized || vaultStatus.legacy) return;
    let timer: number | undefined;
    let locking = false;
    const attemptLock = () => {
      if (locking) return;
      locking = true;
      void onLock().finally(() => { locking = false; });
    };
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      const lastActivity = terminalLastActivityRef.current ?? Date.now();
      const remaining = Math.max(0, lastActivity + seconds * 1000 - Date.now());
      timer = window.setTimeout(attemptLock, remaining);
    };
    const recordActivity = () => {
      if (locking) return;
      terminalLastActivityRef.current = Date.now();
      schedule();
    };
    const checkDeadline = () => {
      const lastActivity = terminalLastActivityRef.current ?? Date.now();
      if (Date.now() >= lastActivity + seconds * 1000) {
        if (timer !== undefined) window.clearTimeout(timer);
        attemptLock();
      } else {
        schedule();
      }
    };
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("pointerdown", recordActivity);
    window.addEventListener("wheel", recordActivity, { passive: true });
    window.addEventListener("focus", checkDeadline);
    globalThis.document.addEventListener("visibilitychange", checkDeadline);
    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("wheel", recordActivity);
      window.removeEventListener("focus", checkDeadline);
      globalThis.document.removeEventListener("visibilitychange", checkDeadline);
    };
  }, [onLock, seconds, terminalLocked, vaultStatus?.initialized, vaultStatus?.legacy]);

}
