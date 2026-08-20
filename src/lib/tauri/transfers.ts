import { Channel, invoke } from "@tauri-apps/api/core";

export type TransferEvent =
  | { type: "started"; totalBytes: number }
  | { type: "progress"; transferredBytes: number; totalBytes: number }
  | { type: "completed" }
  | { type: "cancelled" }
  | { type: "failed"; message: string };

export function selectUploadFile(): Promise<string | null> {
  return invoke<string | null>("transfer_select_upload_file");
}

export function selectDownloadPath(name?: string): Promise<string | null> {
  return invoke<string | null>("transfer_select_download_path", { name: name ?? null });
}

export function selectDownloadDirectory(name: string): Promise<string | null> {
  return invoke<string | null>("transfer_select_download_directory", { name });
}

export function uploadFile(
  sessionId: string,
  localPath: string,
  remotePath: string,
  onEvent: (event: TransferEvent) => void,
): Promise<string> {
  const channel = new Channel<TransferEvent>(onEvent);
  return invoke<string>("transfer_upload", {
    input: { sessionId, localPath, remotePath },
    onEvent: channel,
  });
}

export function downloadFile(
  sessionId: string,
  remotePath: string,
  localPath: string,
  onEvent: (event: TransferEvent) => void,
): Promise<string> {
  const channel = new Channel<TransferEvent>(onEvent);
  return invoke<string>("transfer_download", {
    input: { sessionId, remotePath, localPath, isDirectory: false },
    onEvent: channel,
  });
}

export function uploadDroppedEntries(
  sessionId: string,
  localPaths: string[],
  remoteDirectory: string,
  onEvent: (event: TransferEvent) => void,
): Promise<string> {
  const channel = new Channel<TransferEvent>(onEvent);
  return invoke<string>("transfer_upload_dropped", {
    input: { sessionId, localPaths, remoteDirectory },
    onEvent: channel,
  });
}

export function downloadDirectory(
  sessionId: string,
  remotePath: string,
  localPath: string,
  onEvent: (event: TransferEvent) => void,
): Promise<string> {
  const channel = new Channel<TransferEvent>(onEvent);
  return invoke<string>("transfer_download", {
    input: { sessionId, remotePath, localPath, isDirectory: true },
    onEvent: channel,
  });
}

export function cancelTransfer(
  sessionId: string,
  transferId: string,
): Promise<void> {
  return invoke("transfer_cancel", { sessionId, transferId });
}
