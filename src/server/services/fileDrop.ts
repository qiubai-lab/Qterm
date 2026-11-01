import type * as Desktop from "../../lib/tauri/fileDrop";
/** No OS paths or native drag subscriptions exist in a browser runtime. */
export const listenFileDrop: typeof Desktop.listenFileDrop = async () => () => undefined;
