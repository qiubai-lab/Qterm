import type { Terminal } from "@xterm/xterm";

type SessionTerminal = Pick<Terminal, "write">;

const RESET_TO_INITIAL_STATE = "\x1bc";

export function resetTerminalSession(terminal: SessionTerminal) {
  // Keep the reset ordered with already queued output so stale bytes cannot
  // repopulate the new buffer and leave xterm's viewport out of sync.
  terminal.write(RESET_TO_INITIAL_STATE);
}
