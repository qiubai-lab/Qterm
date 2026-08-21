import { Channel, invoke } from "@tauri-apps/api/core";

export type SessionState =
  | "connecting"
  | "awaitingHostKey"
  | "authenticating"
  | "connected"
  | "closing"
  | "closed"
  | "failed";

export type SessionEvent =
  | { type: "stateChanged"; state: SessionState }
  | { type: "routeProgress"; node: SessionNode; stage: SessionRouteStage }
  | {
      type: "hostKeyConfirmationRequired";
      node: SessionNode;
      algorithm: string;
      fingerprint: string;
    }
  | {
      type: "hostKeyChanged";
      node: SessionNode;
      trustedFingerprint: string;
      presentedFingerprint: string;
    }
  | { type: "failed"; code: string; message: string; node: SessionNode | null; stage: SessionRouteStage | null };

export type SessionRouteStage = "connect" | "verifyHostKey" | "authenticate" | "openTunnel" | "startSession";

export interface SessionNode {
  profileId: string;
  name: string;
  host: string;
  port: number;
  index: number;
  total: number;
  role: "jump" | "target";
}

export type SessionAuth =
  | { method: "password"; password: string }
  | { method: "sshAgent" }
  | { method: "storedCredential"; credentialId: string };

export interface SessionConnectInput {
  profileId: string;
  auth: SessionAuth;
}

export function connectSession(
  input: SessionConnectInput,
  onEvent: (event: SessionEvent) => void,
  onTerminalData: (data: Uint8Array) => void,
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
