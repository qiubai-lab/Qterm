import type * as Desktop from "../../lib/tauri/sessions";
import { closeDemoSession, getDemoSession, openDemoSession } from "../sessionRegistry";
import { readText } from "./textClipboard";
import { closeFeatureSession } from "../featureSessions";

export const connectSession: typeof Desktop.connectSession = async (input, onEvent, onData) =>
  openDemoSession(input.terminalSize.columns, input.terminalSize.rows, onData, onEvent, input.profileId, input.initialDirectory).sessionId;
export const writeSession: typeof Desktop.writeSession = async (id, data) => { getDemoSession(id).write(data); };
export const resizeSession: typeof Desktop.resizeSession = async (id, columns, rows) => { getDemoSession(id).resize(columns, rows); };
export const closeSession: typeof Desktop.closeSession = async id => { if (!closeFeatureSession(id)) closeDemoSession(id); };
export const acceptHostKey: typeof Desktop.acceptHostKey = async () => { throw new Error("演示环境不执行真实主机信任操作。"); };
export const rejectHostKey: typeof Desktop.rejectHostKey = closeSession;
export const startTerminalClipboardStaging: typeof Desktop.startTerminalClipboardStaging = async () => {
  const text = await readText();
  return text ? { kind: "text", text } : { kind: "empty" };
};
export const cancelTerminalClipboardStaging: typeof Desktop.cancelTerminalClipboardStaging = async () => undefined;
