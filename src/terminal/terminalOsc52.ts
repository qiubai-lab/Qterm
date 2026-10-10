import type { IDisposable, ITerminalAddon, Terminal } from "@xterm/xterm";

// Bound allocation and native IPC independently of xterm's OSC parser limit.
export const MAX_OSC52_BYTES = 1024 * 1024;
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_OSC52_BYTES / 3);

function clipboardText(data: string): string | null {
  if (data.length > MAX_BASE64_LENGTH + 2) return null;
  const separator = data.indexOf(";");
  if (separator < 0) return null;
  const selection = data.slice(0, separator);
  // Empty selection defaults to the system clipboard. PRIMARY/cut buffers
  // and clipboard queries are deliberately not exposed to the remote process.
  if (selection !== "" && selection !== "c") return null;
  const payload = data.slice(separator + 1);
  if (payload === "?" || payload.length > MAX_BASE64_LENGTH) return null;
  try {
    const binary = atob(payload);
    if (binary.length > MAX_OSC52_BYTES || btoa(binary) !== payload) return null;
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

/** Write-only OSC 52 adapter, owned and disposed by the terminal's addon manager. */
export function createTerminalOsc52Addon(writeText: (text: string) => Promise<void>): ITerminalAddon {
  let handler: IDisposable | undefined;
  return {
    activate(terminal: Terminal) {
      handler = terminal.parser.registerOscHandler(52, async (data) => {
        const text = clipboardText(data);
        if (text !== null) {
          try {
            // Awaiting keeps successive writes ordered through xterm's parser.
            await writeText(text);
          } catch {
            // A clipboard failure must not reject and stall the output parser.
          }
        }
        return true;
      });
    },
    dispose() { handler?.dispose(); },
  };
}
