/** Workspaces and editors register their own flush; failures must prevent navigation. */
const guards = new Set<() => Promise<void>>();
export function registerRuntimeFlush(flush: () => Promise<void>) { guards.add(flush); return () => { guards.delete(flush); }; }
export async function flushRuntime(signal?: AbortSignal) { for (const flush of guards) { signal?.throwIfAborted(); await flush(); } }

const cleanups = new Set<() => Promise<void>>();
export function registerRuntimeDetach(detach: () => Promise<void>) { cleanups.add(detach); return () => { cleanups.delete(detach); }; }
let detaching = false;
export function assertRuntimeAttached() { if (detaching) throw new Error("正在切换运行环境，请稍后操作"); }
export async function detachRuntime(signal?: AbortSignal) {
  detaching = true;
  // Native IPC yields let React re-render and replace effect registrations.
  // Iterating the live Set would visit those replacements again indefinitely.
  const pending = [...cleanups];
  try { for (const detach of pending) { signal?.throwIfAborted(); await detach(); } signal?.throwIfAborted(); }
  catch (error) { detaching = false; throw error; }
}
