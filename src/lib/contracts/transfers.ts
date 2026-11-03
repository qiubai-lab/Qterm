export type TransferEvent =
  | { type: "started"; totalBytes: number }
  | { type: "progress"; transferredBytes: number; totalBytes: number; message?: string }
  | { type: "handedOff" }
  | { type: "completed" }
  | { type: "cancelled" }
  | { type: "failed"; message: string };
