// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/paneState";
import * as remote from "../../server/services/paneState";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/paneState";
export const loadPaneState: typeof local.loadPaneState = (...args) => (selectedRuntime ? remote.loadPaneState : local.loadPaneState)(...args);
export const savePaneState: typeof local.savePaneState = (...args) => (selectedRuntime ? remote.savePaneState : local.savePaneState)(...args);
