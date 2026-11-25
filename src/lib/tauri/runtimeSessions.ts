import type { SessionEvent } from "../contracts/sessions";
export interface RetainedSession {sessionId:string;runtimeKey:string|null;kind:string;ruleStates?:Record<string,"running">;profileId:string|null;status:string;cwd:string|null}
export type RecoveryLookup = { blockId: string } | { blockIds: string[] };
export async function listRetainedSessions(_lookup?: RecoveryLookup): Promise<RetainedSession[]> { void _lookup; return []; }
export async function attachRetainedSession(_session:RetainedSession,_onEvent:(event:SessionEvent)=>void,_onData:(data:Uint8Array,consumed?:()=>void)=>void):Promise<string>{void _session; void _onEvent; void _onData; throw new Error("Desktop sessions are attached directly");}
export async function releaseRetainedBlock(_blockId:string):Promise<void>{ void _blockId; /* Native sessions already follow the window lifecycle. */ }
