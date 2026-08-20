import { Channel, invoke } from "@tauri-apps/api/core";

import type { SessionConnectInput, SessionEvent } from "./sessions";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  modifiedAt: number | null;
  permissionMode: number | null;
}

export interface FileDocument {
  content: string;
  revision: string;
  modifiedAt: number | null;
  size: number;
}

export interface DirectoryListing {
  path: string;
  entries: FileEntry[];
}

export interface LocalRoot {
  name: string;
  path: string;
}

export function listLocalDirectory(path: string): Promise<DirectoryListing> {
  return invoke<DirectoryListing>("files_list_local", { path });
}

export function listLocalRoots(): Promise<LocalRoot[]> {
  return invoke<LocalRoot[]>("files_list_local_roots");
}

export function listRemoteDirectory(sessionId: string, path: string): Promise<DirectoryListing> {
  return invoke<DirectoryListing>("files_list_remote", { input: { sessionId, path } });
}

export function readTextFile(sessionId: string | null, path: string): Promise<FileDocument> {
  return invoke<FileDocument>("files_read_text", { input: { sessionId, path } });
}

export function readBinaryFile(sessionId: string | null, path: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("files_read_binary", { input: { sessionId, path } });
}

export function writeTextFile(
  sessionId: string | null,
  path: string,
  content: string,
  expectedRevision: string,
): Promise<FileDocument> {
  return invoke<FileDocument>("files_write_text", { input: { sessionId, path, content, expectedRevision } });
}

export function copyFile(sessionId: string | null, path: string, targetName: string): Promise<void> {
  return invoke("files_copy_entry", { input: { sessionId, path, targetName } });
}

export function createEntry(sessionId: string | null, directory: string, name: string, isDirectory: boolean): Promise<void> {
  return invoke("files_create_entry", { input: { sessionId, directory, name, isDirectory } });
}

export function renameEntry(sessionId: string | null, path: string, targetName: string): Promise<void> {
  return invoke("files_rename_entry", { input: { sessionId, path, targetName } });
}

export function deleteEntry(sessionId: string | null, path: string): Promise<void> {
  return invoke("files_delete_entry", { input: { sessionId, path } });
}

export function connectFileSession(input: SessionConnectInput, onEvent: (event: SessionEvent) => void): Promise<string> {
  return invoke<string>("files_session_connect", {
    input,
    onEvent: new Channel<SessionEvent>(onEvent),
  });
}
