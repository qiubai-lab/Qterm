import type { IMarker, Terminal } from "@xterm/xterm";

type Position = { marker: IMarker; column: number };
interface Command { id: number; prompt: Position; output?: Position; end?: Position; unsafe: boolean; exitCode?: number }
const MAX_COMMANDS = 200;
const MAX_OUTPUT_CHARS = 1024 * 1024;

/** Positions refer only to the current normal buffer; no command text is retained. */
export function createTerminalCommands(terminal: Terminal) {
  let records: Command[] = [];
  let pending: Command | undefined;
  let selected: number | undefined;
  let sequence = 0;
  const normal = () => terminal.buffer.active.type === "normal";
  const position = (): Position | undefined => {
    const marker = terminal.registerMarker(0);
    return marker ? { marker, column: terminal.buffer.active.cursorX } : undefined;
  };
  const release = (command: Command) => {
    command.prompt.marker.dispose(); command.output?.marker.dispose(); command.end?.marker.dispose();
  };
  function prune() {
    records = records.filter((command) => {
      if (!command.prompt.marker.isDisposed) return true;
      release(command);
      if (pending === command) pending = undefined;
      if (selected === command.id) selected = undefined;
      return false;
    });
  }
  function reset() {
    records.forEach(release); records = []; pending = undefined; selected = undefined;
  }
  function accept(data: string) {
    if (!normal()) return;
    prune();
    if (data === "A") {
      const prompt = position();
      if (!prompt) return;
      // An interrupted/incomplete command is never offered as completed output.
      pending = { id: ++sequence, prompt, unsafe: false };
      records.push(pending);
      selected = undefined;
      if (records.length > MAX_COMMANDS) release(records.shift()!);
    } else if (data === "C" && pending && !pending.output) {
      pending.output = position();
    } else if (/^D(?:;\d{1,10})?$/.test(data) && pending?.output) {
      pending.end = position();
      pending.exitCode = data.includes(";") ? Number(data.slice(2)) : undefined;
      pending = undefined;
    }
  }
  function current() {
    prune();
    return selected === undefined ? [...records].reverse().find((command) => command.end) : records.find((command) => command.id === selected);
  }
  function output(): string | null {
    if (!normal()) return null;
    const command = current();
    if (!command?.output || !command.end || command.unsafe) return null;
    const start = command.output; const end = command.end;
    if (start.marker.isDisposed || end.marker.isDisposed || end.marker.line < start.marker.line) return null;
    let text = "";
    for (let row = start.marker.line; row <= end.marker.line; row++) {
      if (row === end.marker.line && end.column === 0) break;
      const line = terminal.buffer.normal.getLine(row);
      if (!line) return null;
      if (row > start.marker.line && !line.isWrapped) text += "\n";
      text += line.translateToString(true, row === start.marker.line ? start.column : 0, row === end.marker.line ? end.column : undefined);
      if (text.length > MAX_OUTPUT_CHARS) return null;
    }
    return text;
  }
  function navigation() {
    prune();
    const navigable = records.filter((command) => command.output);
    const index = navigable.findIndex((command) => command.id === selected);
    return { index, navigable, previous: normal() && (index < 0 ? navigable.length > 0 : index > 0), next: normal() && index >= 0 && index < navigable.length - 1 };
  }
  function navigate(direction: "previous" | "next") {
    const state = navigation();
    if (!state[direction]) return;
    const index = state.index < 0 ? state.navigable.length - 1 : state.index + (direction === "previous" ? -1 : 1);
    const command = state.navigable[index];
    selected = command.id;
    terminal.scrollToLine(command.prompt.marker.line);
  }
  return {
    accept, reset, output, navigate,
    enteredAlternate() { if (pending) pending.unsafe = true; },
    snapshot() {
      const state = navigation(); const command = current();
      return { previous: state.previous, next: state.next, canCopy: normal() && Boolean(command?.output && command.end && !command.unsafe && !command.output.marker.isDisposed && !command.end.marker.isDisposed && (command.output.marker.line !== command.end.marker.line || command.output.column !== command.end.column)), count: state.navigable.length, selected: command?.id ?? null, exitCode: command?.exitCode ?? null };
    },
  };
}
