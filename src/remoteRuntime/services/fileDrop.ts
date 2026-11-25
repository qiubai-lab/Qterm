import { listenFileDrop as listenNative } from "../../lib/tauri/fileDrop";
import { environmentForeground } from "../desktop/foreground";
import { framePort } from "../desktop/frame";

export const listenFileDrop: typeof listenNative = handler =>
  (framePort ? framePort.fileDrop.listen : listenNative)(event => {
    if (event.payload.type === "leave" || environmentForeground()) handler(event);
  });
