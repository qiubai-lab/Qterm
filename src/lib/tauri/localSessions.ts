import { Channel, invoke } from "@tauri-apps/api/core";

export type LocalSessionEvent =
  | { type: "stateChanged"; state: "connected" | "closed" };

export interface LocalTerminalCapabilities {
  windowsPty: {
    backend: "conpty";
    buildNumber: number;
  } | null;
}

export interface LocalSessionConnection {
  sessionId: string;
  cwd: string;
}

export type LocalTerminalClipboardPaste =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "paths"; text: string; displayName: string; itemCount: number };

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
  onTerminalData: (data: Uint8Array) => void,
  osc7Enabled: boolean,
  initialDirectory?: string,
): Promise<LocalSessionConnection> {
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
