import { assertRuntimeAttached } from "../switchGuard";
// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/localSessions";
import * as remote from "../../server/services/localSessions";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/localSessions";
export const getLocalTerminalCapabilities: typeof local.getLocalTerminalCapabilities = (...args) => (selectedRuntime ? remote.getLocalTerminalCapabilities : local.getLocalTerminalCapabilities)(...args);
export const prepareLocalTerminalClipboardPaste: typeof local.prepareLocalTerminalClipboardPaste = (...args) => (selectedRuntime ? remote.prepareLocalTerminalClipboardPaste : local.prepareLocalTerminalClipboardPaste)(...args);
export const connectLocalSession: typeof local.connectLocalSession = (...args) => { assertRuntimeAttached(); return (selectedRuntime ? remote.connectLocalSession : local.connectLocalSession)(...args) };
export const writeLocalSession: typeof local.writeLocalSession = (...args) => (selectedRuntime ? remote.writeLocalSession : local.writeLocalSession)(...args);
export const resizeLocalSession: typeof local.resizeLocalSession = (...args) => (selectedRuntime ? remote.resizeLocalSession : local.resizeLocalSession)(...args);
export const closeLocalSession: typeof local.closeLocalSession = (...args) => (selectedRuntime ? remote.closeLocalSession : local.closeLocalSession)(...args);
