import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export const listenFileDrop: ReturnType<typeof getCurrentWebview>["onDragDropEvent"] = handler =>
  getCurrentWebview().onDragDropEvent(handler);

export interface DropSelection { id: string; entries: { path: string; size: number; token: string | null }[] }
export function readDroppedEntries(runtimeId: string, paths: string[]) {
  return invoke<DropSelection>("remote_runtime_drop", { runtimeId, paths });
}
export function releaseDrop(runtimeId: string, id: string) {
  return invoke<void>("remote_drop_release", { runtimeId, id });
}
