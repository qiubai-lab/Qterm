import { PhysicalPosition } from "@tauri-apps/api/dpi";
import type * as Desktop from "../../lib/tauri/fileDrop";
import { collectDrop, registerUploadError } from "../uploadSelection";
const drops = new WeakMap<DragEvent, Promise<string[]>>();
export const listenFileDrop: typeof Desktop.listenFileDrop = async handler => {
  const emit = (event: DragEvent, type: "over" | "drop", paths: string[] = []) => {
    const position = new PhysicalPosition(event.clientX * devicePixelRatio, event.clientY * devicePixelRatio);
    handler({ event: "browser-file-drop", id: 0, payload: type === "drop" ? { type, paths, position } : { type, position } });
  };
  const over = (event: DragEvent) => { if (event.dataTransfer?.types.includes("Files")) { event.preventDefault(); emit(event,"over"); } };
  const drop = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    let collected = drops.get(event);
    if (!collected) { collected = collectDrop(event.dataTransfer).catch(error => [registerUploadError(error)]); drops.set(event,collected); }
    void collected.then(paths => emit(event,"drop",paths)).catch(() => handler({event:"browser-file-drop",id:0,payload:{type:"leave"}}));
  };
  const leave = (event: DragEvent) => { if (!event.relatedTarget) handler({event:"browser-file-drop",id:0,payload:{type:"leave"}}); };
  window.addEventListener("dragover",over); window.addEventListener("drop",drop); window.addEventListener("dragleave",leave);
  return () => { window.removeEventListener("dragover",over); window.removeEventListener("drop",drop); window.removeEventListener("dragleave",leave); };
};
