export type * from "../contracts/localSessions";
import type { LocalSessionEvent, LocalTerminalCapabilities, LocalSessionConnection, LocalTerminalClipboardPaste } from "../contracts/localSessions";
import { Channel, invoke } from "@tauri-apps/api/core";

export function getLocalTerminalCapabilities(): Promise<LocalTerminalCapabilities> {
  return invoke<LocalTerminalCapabilities>("local_terminal_capabilities");
}

export function prepareLocalTerminalClipboardPaste(): Promise<LocalTerminalClipboardPaste> {
  return invoke<LocalTerminalClipboardPaste>("local_terminal_prepare_clipboard_paste");
}

export function connectLocalSession(
  columns: number,
  rows: number,
  onEvent: (event: LocalSessionEvent) => void,
  onTerminalData: (data: Uint8Array, consumed?: () => void) => void,
  osc7Enabled: boolean,
  initialDirectory?: string,
  _runtimeKey?: string,
): Promise<LocalSessionConnection> {
  void _runtimeKey;
  const eventChannel = new Channel<LocalSessionEvent>(onEvent);
  const terminalChannel = new Channel<{ data: number[] }>((message) => onTerminalData(Uint8Array.from(message.data)));
  return invoke<LocalSessionConnection>("local_session_connect", {
    columns,
    rows,
    osc7Enabled,
    ...(initialDirectory === undefined ? {} : { initialDirectory }),
    onEvent: eventChannel,
    onTerminal: terminalChannel,
  });
}

export function writeLocalSession(sessionId: string, data: Uint8Array): Promise<void> {
  return invoke("local_session_write", { sessionId, data: Array.from(data) });
}

export function resizeLocalSession(sessionId: string, columns: number, rows: number): Promise<void> {
  return invoke("local_session_resize", { sessionId, columns, rows });
}

export function closeLocalSession(sessionId: string): Promise<void> {
  return invoke("local_session_close", { sessionId });
}
