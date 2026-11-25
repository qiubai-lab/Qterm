import { framePort } from "./desktop/frame";
import type { DropSelection } from "../lib/tauri/fileDrop";
import type * as Desktop from "../lib/tauri/transfers";
import { dataLease } from "../server/dataAccess";
import { uploadSelectedEntries } from "../server/services/transfers";
import { registerUpload } from "../server/uploadSelection";

export const uploadRemoteDrop: typeof Desktop.uploadDroppedEntries = async (session, paths, directory, onEvent) => {
  // Only the pane accepting the drop may consume the one-time native authorization.
  const lease = dataLease();
  const source = framePort!.fileDrop;
  let selection: DropSelection;
  try {
    selection = await source.prepare(paths);
  } catch (reason) {
    throw typeof reason === "string" ? new Error(reason) : reason;
  }
  try {
    lease.check();
    const id = registerUpload(selection.entries.map(({ path, size, token }) =>
      token === null ? { path } : { path, native: { size, token } }));
    return await uploadSelectedEntries(session, [id], directory, event => {
      if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
        void source.release(selection.id);
      }
      onEvent(event);
    });
  } catch (error) {
    await source.release(selection.id);
    throw error;
  }
};
