/** One revocable browser data lifetime. Control-plane requests survive suspension. */
let paused = false;
let controller = new AbortController();
const listeners = new Set<() => void>();
export class TerminalLockedError extends Error {
  constructor() { super("终端已锁定，数据传输已暂停；未完成的操作请解锁后检查"); }
}
export const dataPaused = () => paused;
export function subscribeDataAccess(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function pauseData() {
  if (paused) return;
  paused = true;
  document.documentElement.dataset.webDataPaused = "true";
  controller.abort(new TerminalLockedError());
  for (const listener of listeners) listener();
}
export function resumeData() {
  if (!paused) return;
  controller = new AbortController();
  paused = false;
  delete document.documentElement.dataset.webDataPaused;
  for (const listener of listeners) listener();
}
export function dataLease() {
  if (paused) throw new TerminalLockedError();
  const signal = controller.signal;
  return { signal, check: () => { if (signal.aborted || paused) throw new TerminalLockedError(); } };
}
export function isControlRequest(path: string, method = "GET") {
  return method === "GET" && ["/auth", "/terminal-lock", "/access"].includes(path)
    || method === "POST" && ["/login", "/logout", "/access/resume", "/access/takeover", "/terminal-lock/lock", "/terminal-lock/unlock"].includes(path);
}
