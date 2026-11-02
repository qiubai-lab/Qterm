import type * as Desktop from "../../lib/tauri/localSessions";
import { api } from "../http";
import { readText } from "./textClipboard";
import { closeSession, control, openSocket } from "../sessionTransport";
export type * from "../../lib/tauri/localSessions";
export const getLocalTerminalCapabilities: typeof Desktop.getLocalTerminalCapabilities = () => api("/local/capabilities");
export const connectLocalSession: typeof Desktop.connectLocalSession = async (columns, rows, onEvent, onData, osc7Enabled, initialDirectory, runtimeKey) => {
  const connection = await openSocket("/local/sessions", {version:1,columns,rows,osc7Enabled,initialDirectory,runtimeKey}, event => {
    if (event.type === "stateChanged" && (event.state === "connected" || event.state === "closed" || event.state === "connecting")) onEvent({type:"stateChanged",state:event.state});
    else if (event.type === "failed") onEvent({type:"stateChanged",state:"closed",message:event.message});
  }, onData);
  if (!connection.cwd) { void closeSession(connection.sessionId); throw new Error("服务端未返回终端工作目录"); }
  return {sessionId:connection.sessionId,cwd:connection.cwd};
};
export const writeLocalSession: typeof Desktop.writeLocalSession = async (id, data) => control(id, data);
export const resizeLocalSession: typeof Desktop.resizeLocalSession = async (id, columns, rows) => control(id, {type:"resize", columns, rows});
export const closeLocalSession: typeof Desktop.closeLocalSession = async id => closeSession(id);
export const prepareLocalTerminalClipboardPaste: typeof Desktop.prepareLocalTerminalClipboardPaste = async () => ({ kind: "text", text: await readText() });
