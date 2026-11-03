/** Keeps an expired switch from committing, and prevents overlapping native work. */
let inFlight = false;
export async function runRuntimeSwitch(
  steps: { label: string; run: (signal: AbortSignal) => Promise<unknown> }[],
  onStage: (label: string) => void,
  commit: () => void,
  timeoutMs = 30_000,
) {
  if (inFlight) throw new Error("上次切换仍在清理，请稍后重试");
  inFlight = true;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stage = "准备切换";
  const work = (async () => {
    try {
      for (const step of steps) {
        controller.signal.throwIfAborted();
        stage = step.label;
        onStage(stage);
        await step.run(controller.signal);
      }
      controller.signal.throwIfAborted();
      commit();
    } finally { inFlight = false; }
  })();
  try {
    await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`${stage}超时，已停止切换。可以关闭此窗口；清理完成后可重试。`);
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
