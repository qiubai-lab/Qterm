import type { IDisposable, ITerminalAddon, Terminal } from "@xterm/xterm";
import { createTerminalCommands } from "./terminalCommands";

export type TerminalProgress = { state: "running" | "error" | "indeterminate" | "paused"; value: number | null };
export const EMPTY_ACTIVITY = { title: "", progress: null as TerminalProgress | null, commands: { previous: false, next: false, canCopy: false, count: 0, selected: null as number | null, exitCode: null as number | null } };
export type TerminalActivitySnapshot = typeof EMPTY_ACTIVITY;

export function parseTerminalProgress(data: string): TerminalProgress | null | undefined {
  const match = /^4;([0-4])(?:;(\d{1,3}))?$/.exec(data);
  if (!match) return undefined;
  const state = Number(match[1]);
  const value = match[2] === undefined ? null : Number(match[2]);
  if (value !== null && value > 100) return undefined;
  if (state === 0) return null;
  if (state === 1 && value === null) return undefined;
  return { state: (["running", "error", "indeterminate", "paused"] as const)[state - 1], value: state === 3 ? null : value };
}

export function cleanTerminalTitle(value: string) {
  const characters: string[] = [];
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code < 32 || (code >= 127 && code <= 159) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || [0x061c, 0x200e, 0x200f].includes(code)) continue;
    characters.push(character);
    if (characters.length === 160) break;
  }
  return characters.join("").trim();
}

export function createTerminalActivity(changed: () => void = () => undefined) {
  let snapshot: TerminalActivitySnapshot = EMPTY_ACTIVITY;
  let commands: ReturnType<typeof createTerminalCommands> | undefined;
  const subscriptions: IDisposable[] = [];
  let title = "";
  let progress: TerminalProgress | null = null;
  function publish() {
    const next = { title, progress, commands: commands?.snapshot() ?? EMPTY_ACTIVITY.commands };
    if (JSON.stringify(next) !== JSON.stringify(snapshot)) { snapshot = next; changed(); }
  }
  const reset = () => { title = ""; progress = null; commands?.reset(); publish(); };
  const addon: ITerminalAddon = {
    activate(terminal: Terminal) {
      commands = createTerminalCommands(terminal);
      subscriptions.push(
        terminal.parser.registerOscHandler(133, (data) => { commands?.accept(data); return true; }),
        terminal.parser.registerOscHandler(9, (data) => { const next = parseTerminalProgress(data); if (next !== undefined) { progress = next; publish(); } return data.startsWith("4;"); }),
        terminal.onTitleChange((value) => { title = cleanTerminalTitle(value); publish(); }),
        terminal.onWriteParsed(publish),
        terminal.parser.registerCsiHandler({ final: "J" }, (params) => {
          if (params[0] === 2 || params[0] === 3) { commands?.reset(); publish(); }
          return false;
        }),
        terminal.onResize(() => { commands?.reset(); publish(); }),
        terminal.buffer.onBufferChange((buffer) => { if (buffer.type === "alternate") commands?.enteredAlternate(); publish(); }),
        // Observe RIS without consuming it: xterm must still reset its buffer.
        terminal.parser.registerEscHandler({ final: "c" }, () => { reset(); return false; }),
      );
    },
    dispose() { subscriptions.splice(0).forEach((subscription) => subscription.dispose()); reset(); },
  };
  return { addon, reset, snapshot: () => snapshot, output: () => commands?.output() ?? null,
    navigate(direction: "previous" | "next") { commands?.navigate(direction); publish(); } };
}

export type TerminalActivity = ReturnType<typeof createTerminalActivity>;
