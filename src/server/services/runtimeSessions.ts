import type * as Desktop from "../../lib/tauri/runtimeSessions";
import { api } from "../http";
import { closeSession,openSocket } from "../sessionTransport";
export type * from "../../lib/tauri/runtimeSessions";
export const listRetainedSessions:typeof Desktop.listRetainedSessions=()=>api("/runtime/sessions");
export const attachRetainedSession:typeof Desktop.attachRetainedSession=(session,onEvent,onData)=>openSocket("/runtime/attach",{version:2,sessionId:session.sessionId,runtimeKey:session.runtimeKey},onEvent,onData).then(s=>s.sessionId);
export const releaseRetainedBlock:typeof Desktop.releaseRetainedBlock=async key=>{
  const session=(await listRetainedSessions()).find(s=>s.runtimeKey===key);
  if(session)await closeSession(session.sessionId);
};
