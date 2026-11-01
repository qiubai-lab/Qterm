import { useEffect, type RefObject, type Dispatch, type SetStateAction } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isServer } from "../../../lib/runtime/environment";
export function useCredentialPrivateKeyDrop(active:boolean,busy:boolean,dropRef:RefObject<HTMLButtonElement|null>,prepareRef:RefObject<(path?:string)=>Promise<void>>,setDropState:Dispatch<SetStateAction<"idle"|"active"|"invalid">>) {
  useEffect(() => {
    if (isServer || !active) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const insideDropzone = (position: { x: number; y: number }) => {
      const rect = dropRef.current?.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const x = position.x / ratio;
      const y = position.y / ratio;
      return Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    };
    void getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "leave") { setDropState("idle"); return; }
      const inside = insideDropzone(payload.position);
      if (payload.type === "enter" || payload.type === "over") {
        setDropState(inside && !busy ? "active" : "idle");
        return;
      }
      setDropState("idle");
      if (!inside || busy) return;
      if (payload.paths.length !== 1) { setDropState("invalid"); return; }
      void prepareRef.current(payload.paths[0]);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => setDropState("idle"));
    return () => { disposed = true; unlisten?.(); setDropState("idle"); };
  }, [active, busy, dropRef, prepareRef, setDropState]);
}
