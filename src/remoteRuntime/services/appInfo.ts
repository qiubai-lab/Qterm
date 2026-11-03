// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/appInfo";
import * as remote from "../../server/services/appInfo";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/appInfo";
export const getVersion: typeof local.getVersion = (...args) => (selectedRuntime ? remote.getVersion : local.getVersion)(...args);
