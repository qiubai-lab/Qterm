export type * from "../contracts/sessions";
import type { SessionEvent, TerminalSessionConnectInput, TerminalStagingEvent, TerminalClipboardPasteStart } from "../contracts/sessions";
import { Channel, invoke } from "@tauri-apps/api/core";

export function connectSession(
  input: TerminalSessionConnectInput,
  onEvent: (event: SessionEvent) => void,
  onTerminalData: (data: Uint8Array, consumed?: () => void) => void,
): Promise<string> {
  const eventChannel = new Channel<SessionEvent>(onEvent);
  const terminalChannel = new Channel<{ data: number[] }>((message) =>
    onTerminalData(Uint8Array.from(message.data)),
  );
  return invoke<string>("session_connect", {
    input,
    onEvent: eventChannel,
    onTerminal: terminalChannel,
  });
}

export function writeSession(sessionId: string, data: Uint8Array): Promise<void> {
  return invoke("session_write", { sessionId, data: Array.from(data) });
}

export function resizeSession(
  sessionId: string,
  columns: number,
  rows: number,
): Promise<void> {
  return invoke("session_resize", { sessionId, columns, rows });
}

export function acceptHostKey(sessionId: string): Promise<void> {
  return invoke("session_accept_host_key", { sessionId });
}

export function rejectHostKey(sessionId: string): Promise<void> {
  return invoke("session_reject_host_key", { sessionId });
}

export function closeSession(sessionId: string): Promise<void> {
  return invoke("session_close", { sessionId });
}

export function startTerminalClipboardStaging(
  sessionId: string,
  onEvent: (event: TerminalStagingEvent) => void,
  browserInput?: import("../contracts/sessions").TerminalClipboardInput,
): Promise<TerminalClipboardPasteStart> {
  void browserInput;
  return invoke("session_start_clipboard_staging", {
    sessionId,
    onEvent: new Channel<TerminalStagingEvent>(onEvent),
  });
}

export function cancelTerminalClipboardStaging(sessionId: string, taskId: string): Promise<void> {
  return invoke("session_cancel_clipboard_staging", { sessionId, taskId });
}
