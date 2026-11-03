import { invoke } from "@tauri-apps/api/core";
import { listenFileDrop as listenNativeDrop } from "../lib/tauri/fileDrop";
import { registerUpload, registerUploadError } from "../server/uploadSelection";
const drops = new Map<string, Promise<string[]>>();
export const listenRemoteFileDrop: typeof listenNativeDrop = handler => listenNativeDrop(event => {
  if (event.payload.type !== "drop") { handler(event); return; }
  const payload = event.payload;
  const key = JSON.stringify(payload.paths);
  let pending = drops.get(key);
  if (!pending) {
    pending = invoke<{path:string; data:string|null}[]>("remote_runtime_drop", {paths:payload.paths}).then(entries => [registerUpload(entries.map(entry => ({path:entry.path,...(entry.data === null ? {} : {file:new File([Uint8Array.from(atob(entry.data), char => char.charCodeAt(0))], entry.path.split("/").pop()!)})})))]).catch(error => [registerUploadError(error)]);
    drops.set(key, pending);
    void pending.finally(() => { drops.delete(key); });
  }
  void pending.then(paths => handler({...event,payload:{...payload,paths}}));
});
