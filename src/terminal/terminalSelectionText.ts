import type { Terminal } from "@xterm/xterm";

export function terminalSelectionText(terminal: Pick<Terminal, "buffer">): string {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  let size = 0;
  for (let i = buffer.length - 1; i >= 0 && size < 1024 * 1024; i--) {
    const line = buffer.getLine(i);
    const text = (line?.translateToString(true) ?? "") + (buffer.getLine(i + 1)?.isWrapped ? "" : "\n");
    lines.push(text); size += text.length;
  }
  return lines.reverse().join("").trimEnd();
}

