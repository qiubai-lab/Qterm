import { useEffect, useRef } from "react";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import { findLeaf } from "../workspace/layout";
import { listRetainedSessions } from "./services/runtimeSessions";

/** Wait for hydration and mounted terminal writers; never create replacement SSH sessions. */
export function ServerRuntimeRestore() {
  const {hydrated,document,restoreTerminalBlock,restoreFileBlock,restoreGitBlock,restoreNetworkBlock}=useWorkspace();
  const restored=useRef(false);
  useEffect(()=>{
    if(!hydrated || restored.current)return;
    let active=true;
    void listRetainedSessions().then(async sessions=>{
      if(!active)return;
      restored.current=true;
      for(const session of sessions){
        if(!session.runtimeKey)continue;
        const leaf=document.workspaces.map(w=>findLeaf(w.layout,session.runtimeKey!)).find(Boolean);
        if(leaf?.type==="terminal" && leaf.profileId===session.profileId && session.kind==="terminal")await restoreTerminalBlock(session);
        if(leaf?.type==="git" && leaf.target.type==="remote" && leaf.target.profileId===session.profileId && session.kind==="git")await restoreGitBlock(session);
        if(leaf?.type==="network" && leaf.profileId===session.profileId && session.kind==="network")await restoreNetworkBlock(session);
        if(leaf?.type==="files" && leaf.profileId===session.profileId && session.kind==="files")await restoreFileBlock(session);
      }
    }).catch(()=>{ /* API authentication handling owns login expiry. */ });
    return()=>{active=false;};
  },[document,hydrated,restoreFileBlock,restoreGitBlock,restoreNetworkBlock,restoreTerminalBlock]);
  return null;
}
