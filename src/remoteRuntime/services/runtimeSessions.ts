// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/runtimeSessions";
import * as remote from "../../server/services/runtimeSessions";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/runtimeSessions";
export const listRetainedSessions: typeof local.listRetainedSessions = (...args) => (selectedRuntime ? remote.listRetainedSessions : local.listRetainedSessions)(...args);
export const attachRetainedSession: typeof local.attachRetainedSession = (...args) => (selectedRuntime ? remote.attachRetainedSession : local.attachRetainedSession)(...args);
export const releaseRetainedBlock: typeof local.releaseRetainedBlock = (...args) => (selectedRuntime ? remote.releaseRetainedBlock : local.releaseRetainedBlock)(...args);
