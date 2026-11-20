/** Reserve one handshake slot for the foreground even when background sessions are slow. */
export function createSessionStartQueue() {
  let visible = new Set<string>();
  let selected: string | undefined;
  let running = 0;
  type Pending = { key?: string; start(): void; cancel(): void };
  const waiting = new Set<Pending>();
  const priority = (task: Pending) => !task.key || task.key === selected ? 0 : visible.has(task.key) ? 1 : 2;

  function drain() {
    while (waiting.size && running < 3) {
      const next = Array.from(waiting).reduce((first, item) => priority(item) < priority(first) ? item : first);
      if (running >= 2 && priority(next) === 2) return;
      waiting.delete(next);
      running++;
      next.start();
    }
  }

  function schedule<T>(key: string | undefined, signal: AbortSignal, open: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const task: Pending = {
        key,
        start() {
          signal.removeEventListener("abort", task.cancel);
          open().then(resolve, reject).finally(() => { running--; drain(); });
        },
        cancel() {
          waiting.delete(task);
          signal.removeEventListener("abort", task.cancel);
          reject(signal.reason ?? new Error("会话恢复已取消"));
        },
      };
      signal.addEventListener("abort", task.cancel, { once: true });
      waiting.add(task);
      drain();
    });
  }
  return {
    schedule,
    foreground(blocks: string[], activeBlock: string | undefined) {
      visible = new Set(blocks);
      selected = activeBlock;
      drain();
    },
    cancelWaiting() { for (const task of waiting) task.cancel(); },
  };
}

export const sessionStartQueue = createSessionStartQueue();
