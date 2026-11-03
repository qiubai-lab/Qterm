import type { Terminal } from "@xterm/xterm";
import type { TerminalInputScheduler } from "./terminalInputScheduler";

/** xterm binary reports contain bytes, not Unicode text. Keep both event streams ordered. */
export function bindTerminalInput(terminal: Pick<Terminal, "onData" | "onBinary">, scheduler: TerminalInputScheduler) {
  const text = terminal.onData(data => { void scheduler.send(data); });
  const binary = terminal.onBinary(data => {
    void scheduler.send(Uint8Array.from(data, character => character.charCodeAt(0) & 0xff));
  });
  return { dispose: () => { text.dispose(); binary.dispose(); } };
}
