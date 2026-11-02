import { pauseData, resumeData } from "./dataAccess";
import type { TerminalLockBackend } from "../workspace/useTerminalLock";
import { api } from "./http";

let revision = 0;
export function resetServerTerminalLock() { revision += 1; pauseData(); }
async function readState(path: string, method = "GET", body?: unknown) {
  const current = ++revision;
  if (path !== "/terminal-lock/unlock") pauseData();
  const value = await api<{ locked?: unknown } | null>(path, method, body);
  if (!value || typeof value.locked !== "boolean") throw new Error("无法确认终端锁定状态，请重试");
  if (current === revision) { if (value.locked) pauseData(); else resumeData(); }
  return { locked: value.locked };
}

export const serverTerminalLock: TerminalLockBackend = {
  read: () => readState("/terminal-lock"),
  lock: () => readState("/terminal-lock/lock", "POST"),
  unlock: masterPassword => readState("/terminal-lock/unlock", "POST", { masterPassword }),
};
