interface TerminalSize {
  columns: number;
  rows: number;
}

export interface ResizeScheduler {
  request: (columns: number, rows: number) => void;
  dispose: () => void;
}

export function createResizeScheduler(
  send: (columns: number, rows: number) => Promise<void>,
  delayMs = 0,
): ResizeScheduler {
  let pending: TerminalSize | null = null;
  let inFlight: TerminalSize | null = null;
  let lastSuccessful: TerminalSize | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const flush = async () => {
    if (disposed || inFlight || !pending) return;
    const next = pending;
    pending = null;
    inFlight = next;
    let succeeded = false;
    try {
      await send(next.columns, next.rows);
      succeeded = true;
    } catch {
      // A transient resize error must not block future dimensions.
    }
    if (succeeded) lastSuccessful = next;
    inFlight = null;
    if (disposed || !pending) return;
    if (sameSize(pending, lastSuccessful)) {
      pending = null;
      return;
    }
    void flush();
  };

  const schedule = () => {
    if (disposed || inFlight || timer !== null || !pending) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, Math.max(0, delayMs));
  };

  return {
    request(columns, rows) {
      if (disposed) return;
      const next = { columns, rows };
      if (sameSize(next, pending)) return;
      if (sameSize(next, inFlight)) {
        pending = null;
        clearTimer();
        return;
      }
      if (!inFlight && sameSize(next, lastSuccessful)) {
        pending = null;
        clearTimer();
        return;
      }
      pending = next;
      schedule();
    },
    dispose() {
      disposed = true;
      pending = null;
      clearTimer();
    },
  };
}

function sameSize(left: TerminalSize | null, right: TerminalSize | null): boolean {
  return Boolean(left && right && left.columns === right.columns && left.rows === right.rows);
}
