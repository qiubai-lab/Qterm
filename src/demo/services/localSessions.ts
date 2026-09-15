import type * as Desktop from "../../lib/tauri/localSessions";
import { closeDemoSession, getDemoSession, openDemoSession } from "../sessionRegistry";
import { readText } from "./textClipboard";

export const getLocalTerminalCapabilities: typeof Desktop.getLocalTerminalCapabilities = async () => ({ windowsPty: null });
export const prepareLocalTerminalClipboardPaste: typeof Desktop.prepareLocalTerminalClipboardPaste = async () => {
  const text = await readText();
  return text ? { kind: "text", text } : { kind: "empty" };
};
export const connectLocalSession: typeof Desktop.connectLocalSession = async (columns, rows, onEvent, onData, _osc7, cwd) =>
  openDemoSession(columns, rows, onData, event => {
    if (event.type === "stateChanged" && (event.state === "connected" || event.state === "closed")) onEvent({ type: "stateChanged", state: event.state });
  }, undefined, cwd);
export const writeLocalSession: typeof Desktop.writeLocalSession = async (id, data) => { getDemoSession(id).write(data); };
export const resizeLocalSession: typeof Desktop.resizeLocalSession = async (id, columns, rows) => { getDemoSession(id).resize(columns, rows); };
export const closeLocalSession: typeof Desktop.closeLocalSession = async id => { closeDemoSession(id); };
