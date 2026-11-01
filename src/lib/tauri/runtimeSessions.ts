import type { SessionEvent } from "../contracts/sessions";
export interface RetainedSession {sessionId:string;runtimeKey:string|null;kind:string;profileId:string|null;status:string;cwd:string|null}
export async function listRetainedSessions():Promise<RetainedSession[]> {return [];}
export async function attachRetainedSession(_session:RetainedSession,_onEvent:(event:SessionEvent)=>void,_onData:(data:Uint8Array,consumed?:()=>void)=>void):Promise<string>{void _session; void _onEvent; void _onData; throw new Error("Desktop sessions are attached directly");}
export async function releaseRetainedBlock(_blockId:string):Promise<void>{ void _blockId; /* Native sessions already follow the window lifecycle. */ }
