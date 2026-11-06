import { invoke } from "@tauri-apps/api/core";
import type * as Desktop from "../lib/tauri/transfers";
import { dataLease } from "../server/dataAccess";
import { uploadSelectedEntries } from "../server/services/transfers";
import { registerUpload } from "../server/uploadSelection";

interface DroppedEntry { path: string; data: string | null }

export const uploadRemoteDrop: typeof Desktop.uploadDroppedEntries = async (session, paths, directory, onEvent) => {
  // Only the pane accepting the drop may consume the one-time native authorization.
  const lease = dataLease();
  let entries: DroppedEntry[];
  try {
    entries = await invoke<DroppedEntry[]>("remote_runtime_drop", { paths });
  } catch (reason) {
    throw typeof reason === "string" ? new Error(reason) : reason;
  }
  lease.check();
  const selection = registerUpload(entries.map(({ path, data }) => {
    if (data === null) return { path };
    const decoded = atob(data);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return { path, file: new File([bytes], path.split("/").pop()!) };
  }));
  return uploadSelectedEntries(session, [selection], directory, onEvent);
};
