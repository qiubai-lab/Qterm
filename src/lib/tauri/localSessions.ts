import { Channel, invoke } from "@tauri-apps/api/core";

export type LocalSessionEvent =
  | { type: "stateChanged"; state: "connected" | "closed" };

export interface LocalTerminalCapabilities {
  windowsPty: {
    backend: "conpty";
    buildNumber: number;
  } | null;
}

export function getLocalTerminalCapabilities(): Promise<LocalTerminalCapabilities> {
  return invoke<LocalTerminalCapabilities>("local_terminal_capabilities");
}

export function connectLocalSession(
  columns: number,
  rows: number,
  onEvent: (event: LocalSessionEvent) => void,
  onTerminalData: (data: Uint8Array) => void,
): Promise<string> {
  const eventChannel = new Channel<LocalSessionEvent>(onEvent);
  const terminalChannel = new Channel<{ data: number[] }>((message) => onTerminalData(Uint8Array.from(message.data)));
  return invoke<string>("local_session_connect", {
    columns,
    rows,
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
