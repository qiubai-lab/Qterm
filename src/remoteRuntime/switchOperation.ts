/** Keeps an expired switch from committing, and prevents overlapping native work. */
let inFlight = false;
export async function runRuntimeSwitch(
  steps: { label: string; timeoutMessage?: string; run: (signal: AbortSignal) => Promise<unknown> }[],
  onStage: (label: string) => void,
  commit: () => void,
  timeoutMs = 30_000,
  options: { signal?: AbortSignal; onAborted?: () => Promise<void> } = {},
) {
  const { signal } = options;
  signal?.throwIfAborted();
  if (inFlight) throw new Error("上次操作仍在结束，请稍后重试");
  inFlight = true;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timeoutMessage = "操作超时，请重试";
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  let rejectStopped!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectStopped = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectStopped, { once: true });
    timer = setTimeout(() => controller.abort(new Error(timeoutMessage)), timeoutMs);
  });
  const work = (async () => {
    try {
      for (const step of steps) {
        controller.signal.throwIfAborted();
        timeoutMessage = step.timeoutMessage ?? "操作超时，请重试";
        onStage(step.label);
        await step.run(controller.signal);
      }
      controller.signal.throwIfAborted();
      commit();
    } finally {
      try { if (controller.signal.aborted) await options.onAborted?.(); }
      finally { inFlight = false; }
    }
  })();
  try {
    await Promise.race([work, stopped]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectStopped);
  }
}
