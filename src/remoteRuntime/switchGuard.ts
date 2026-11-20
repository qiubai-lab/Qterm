/** Workspaces and editors register their own flush; failures must prevent navigation. */
const guards = new Set<() => Promise<void>>();
export function registerRuntimeFlush(flush: () => Promise<void>) { guards.add(flush); return () => { guards.delete(flush); }; }
export async function flushRuntime(signal?: AbortSignal) { for (const flush of [...guards]) { signal?.throwIfAborted(); await flush(); } }
