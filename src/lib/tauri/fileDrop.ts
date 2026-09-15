import { getCurrentWebview } from "@tauri-apps/api/webview";

export const listenFileDrop: ReturnType<typeof getCurrentWebview>["onDragDropEvent"] = handler => getCurrentWebview().onDragDropEvent(handler);
