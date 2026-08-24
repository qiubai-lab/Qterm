export type CaptureTerminalInput = (emit: () => void) => Promise<void>;

export interface TerminalInputScheduler {
  send: (data: string) => Promise<void>;
  runExclusive: (operation: (capture: CaptureTerminalInput) => void | Promise<void>) => Promise<void>;
  dispose: () => void;
}

export function createTerminalInputScheduler(
  write: (data: string) => Promise<void>,
  onError: (error: unknown) => void = () => undefined,
): TerminalInputScheduler {
  let tail = Promise.resolve();
  let capturedInput: string[] | null = null;
  let disposed = false;

  const reportError = (error: unknown) => {
    try { onError(error); }
    catch { /* Error reporting must not stall terminal input. */ }
  };

  const deliver = async (data: string) => {
    if (disposed || !data) return;
    try { await write(data); }
    catch (error) { reportError(error); }
  };

  const schedule = (operation: () => void | Promise<void>) => {
    tail = tail.then(async () => {
      if (disposed) return;
      try { await operation(); }
      catch (error) { reportError(error); }
    });
    return tail;
  };

  const capture: CaptureTerminalInput = async (emit) => {
    if (disposed) return;
    if (capturedInput) throw new Error("terminal input capture is already active");
    const batch: string[] = [];
    capturedInput = batch;
    let emitError: unknown;
    try { emit(); }
    catch (error) { emitError = error; }
    finally { capturedInput = null; }
    for (const data of batch) await deliver(data);
    if (emitError) throw emitError;
  };

  return {
    send(data) {
      if (disposed || !data) return Promise.resolve();
      if (capturedInput) {
        capturedInput.push(data);
        return Promise.resolve();
      }
      return schedule(() => deliver(data));
    },
    runExclusive(operation) {
      if (disposed) return Promise.resolve();
      return schedule(() => operation(capture));
    },
    dispose() {
      disposed = true;
      capturedInput = null;
    },
  };
}
