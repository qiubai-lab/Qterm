import { api } from "../http";
const revisions=new Map<string,number>();
export async function loadPaneState(key:string):Promise<unknown>{
  const snapshot=await api<{revision:number;value:unknown}>(`/runtime/panes/${encodeURIComponent(key)}`);
  revisions.set(key,snapshot.revision);return snapshot.value;
}
export async function savePaneState(key:string,value:unknown):Promise<void>{
  const snapshot=await api<{revision:number}>(`/runtime/panes/${encodeURIComponent(key)}`,"PUT",{revision:revisions.get(key)??0,value});
  revisions.set(key,snapshot.revision);
}
