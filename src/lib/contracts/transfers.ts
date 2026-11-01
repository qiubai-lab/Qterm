export type TransferEvent =
  | { type: "started"; totalBytes: number }
  | { type: "progress"; transferredBytes: number; totalBytes: number }
  | { type: "completed" }
  | { type: "cancelled" }
  | { type: "failed"; message: string };
