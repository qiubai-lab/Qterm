/** Workspaces and editors register their own flush; failures must prevent navigation. */
const guards = new Set<() => Promise<void>>();
export function registerRuntimeFlush(flush: () => Promise<void>) { guards.add(flush); return () => { guards.delete(flush); }; }
export async function flushRuntime() { for (const flush of guards) await flush(); }

const cleanups = new Set<() => Promise<void>>();
export function registerRuntimeDetach(detach: () => Promise<void>) { cleanups.add(detach); return () => { cleanups.delete(detach); }; }
let detaching = false;
export function assertRuntimeAttached() { if (detaching) throw new Error("正在切换运行环境，请稍后操作"); }
export async function detachRuntime() {
  detaching = true;
  try { for (const detach of cleanups) await detach(); }
  catch (error) { detaching = false; throw error; }
}
