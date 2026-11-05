import { assertRuntimeAttached } from "../switchGuard";
// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/sessions";
import * as remote from "../../server/services/sessions";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/sessions";
export const connectSession: typeof local.connectSession = (...args) => { assertRuntimeAttached(); return (selectedRuntime ? remote.connectSession : local.connectSession)(...args) };
export const writeSession: typeof local.writeSession = (...args) => (selectedRuntime ? remote.writeSession : local.writeSession)(...args);
export const resizeSession: typeof local.resizeSession = (...args) => (selectedRuntime ? remote.resizeSession : local.resizeSession)(...args);
export const acceptHostKey: typeof local.acceptHostKey = (...args) => (selectedRuntime ? remote.acceptHostKey : local.acceptHostKey)(...args);
export const rejectHostKey: typeof local.rejectHostKey = (...args) => (selectedRuntime ? remote.rejectHostKey : local.rejectHostKey)(...args);
export const closeSession: typeof local.closeSession = (...args) => (selectedRuntime ? remote.closeSession : local.closeSession)(...args);
export const startTerminalClipboardStaging: typeof local.startTerminalClipboardStaging = (...args) => (selectedRuntime ? remote.startTerminalClipboardStaging : local.startTerminalClipboardStaging)(...args);
export const cancelTerminalClipboardStaging: typeof local.cancelTerminalClipboardStaging = (...args) => (selectedRuntime ? remote.cancelTerminalClipboardStaging : local.cancelTerminalClipboardStaging)(...args);

export const forgetHostKey: typeof local.forgetHostKey = (...args) => (selectedRuntime ? remote.forgetHostKey : local.forgetHostKey)(...args);
