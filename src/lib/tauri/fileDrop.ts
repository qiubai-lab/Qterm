import { invoke } from "@tauri-apps/api/core";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { currentDesktopPlatform } from "./window";

export const listenFileDrop: ReturnType<typeof getCurrentWebview>["onDragDropEvent"] = handler => {
  const webview = getCurrentWebview();
  if (currentDesktopPlatform() !== "macos") return webview.onDragDropEvent(handler);

  // Wry 0.55 reports AppKit points as PhysicalPosition on macOS.
  return webview.onDragDropEvent(event => {
    const payload = event.payload;
    if (payload.type === "leave") return handler(event);
    const ratio = window.devicePixelRatio || 1;
    const position = new PhysicalPosition(payload.position.x * ratio, payload.position.y * ratio);
    handler({ ...event, payload: { ...payload, position } });
  });
};

export interface DropSelection { id: string; entries: { path: string; size: number; token: string | null }[] }
export function readDroppedEntries(runtimeId: string, paths: string[]) {
  return invoke<DropSelection>("remote_runtime_drop", { runtimeId, paths });
}
export function releaseDrop(runtimeId: string, id: string) {
  return invoke<void>("remote_drop_release", { runtimeId, id });
}
