// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/workspaces";
import * as remote from "../../server/services/workspaces";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/workspaces";
export const loadWorkspaces: typeof local.loadWorkspaces = (...args) => (selectedRuntime ? remote.loadWorkspaces : local.loadWorkspaces)(...args);
export const saveWorkspaces: typeof local.saveWorkspaces = (...args) => (selectedRuntime ? remote.saveWorkspaces : local.saveWorkspaces)(...args);
