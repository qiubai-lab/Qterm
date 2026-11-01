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
  runtimeKey?: string;
  profileId: string;
  auth: SessionAuth;
}

export interface TerminalSizeInput {
  columns: number;
  rows: number;
}

export interface TerminalSessionConnectInput extends SessionConnectInput {
  terminalSize: TerminalSizeInput;
  initialDirectory?: string;
}

export type TerminalStagingEvent =
  | { type: "preparing" }
  | { type: "scanning"; itemCount: number }
  | { type: "started"; totalBytes: number; itemCount: number; displayName: string }
  | { type: "progress"; transferredBytes: number; totalBytes: number }
  | { type: "completed"; remotePaths: string[] }
  | { type: "cancelled" }
  | { type: "failed" };

export type TerminalClipboardPasteStart =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "transfer"; taskId: string };
