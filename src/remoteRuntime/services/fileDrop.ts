// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/fileDrop";
import { listenRemoteFileDrop } from "../fileDrop";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/fileDrop";
export const listenFileDrop: typeof local.listenFileDrop = (...args) => (selectedRuntime ? listenRemoteFileDrop : local.listenFileDrop)(...args);
