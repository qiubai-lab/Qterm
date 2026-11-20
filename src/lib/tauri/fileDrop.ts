import { getCurrentWebview } from "@tauri-apps/api/webview";
import { framePort } from "../../remoteRuntime/desktop/frame";
import { environmentForeground } from "../../remoteRuntime/desktop/foreground";

export const listenFileDrop: ReturnType<typeof getCurrentWebview>["onDragDropEvent"] = handler =>
  getCurrentWebview().onDragDropEvent(event => {
    if (!environmentForeground()) return;
    const payload = event.payload;
    const frame = framePort && window.frameElement;
    if (!frame || !("position" in payload)) return handler(event);
    const bounds = frame.getBoundingClientRect();
    const position = payload.position;
    const adjusted = Object.assign(Object.create(Object.getPrototypeOf(position)), position, {
      x: position.x - bounds.x * devicePixelRatio, y: position.y - bounds.y * devicePixelRatio,
    });
    handler({ ...event, payload: { ...payload, position: adjusted } });
  });
