export type LocalSessionEvent =
  | { type: "stateChanged"; state: "connected" | "closed" | "connecting"; message?: string };

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
