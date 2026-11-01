import { useEffect,useRef,useState } from "react";
import { loadPaneState,savePaneState } from "@qterm/services/paneState";
import { readBinaryFile } from "@qterm/services/files";
import { isServer } from "../lib/runtime/environment";
import type { FileRuntime } from "../workspace/workspaceRuntime";
import type { FilePreviewState } from "./FilePreviewDocument";
import { imageMime } from "./fileBrowserModel";

export function useRetainedFilePreview(key:string|undefined,runtime:FileRuntime) {
  const [preview,setPreview]=useState<FilePreviewState|null>(null);
  const [restored,setRestored]=useState(!isServer || !key);
  const [error,setError]=useState("");
  const queue=useRef<{pending?:{key:string;value:unknown;signature:string};busy:boolean;last:string}>({busy:false,last:"null"});
  useEffect(()=>{
    if(!isServer || !key || restored || (runtime.kind==="sftp" && runtime.status!=="connected"))return;
    let active=true;
    void loadPaneState(key).then(async value=>{
      const saved=value as FilePreviewState|null;
      queue.current.last=JSON.stringify(value);
      if(saved?.entry?.path && typeof saved.content==="string"){
        if(saved.kind==="image"){
          const bytes=await readBinaryFile(runtime.sessionId,saved.entry.path);
          saved.imageUrl=URL.createObjectURL(new Blob([bytes],{type:imageMime(saved.entry.name)}));
        }
        if(active)setPreview(current=>current ?? {...saved,loading:false,error:""});
        else if(saved.imageUrl)URL.revokeObjectURL(saved.imageUrl);
      }
      if(active)setRestored(true);
    }).catch(()=>{if(active){setError("未能恢复服务端文件草稿，请刷新后重试");}});
    return()=>{active=false;};
  },[key,restored,runtime.kind,runtime.sessionId,runtime.status]);
  useEffect(()=>{
    if(!isServer || !key || !restored || preview?.loading)return;
    const value=preview?{...preview,imageUrl:"",error:""}:null;
    const signature=JSON.stringify(value);
    if(signature===queue.current.last)return;
    queue.current.pending={key,value,signature};
    if(queue.current.busy)return;
    queue.current.busy=true;
    void (async()=>{
      while(queue.current.pending){
        const next=queue.current.pending;queue.current.pending=undefined;
        try{await savePaneState(next.key,next.value);queue.current.last=next.signature;setError("");}
        catch(reason){setError(reason instanceof Error?reason.message:"草稿尚未同步到服务端，请保持页面打开");}
      }
      queue.current.busy=false;
    })();
  },[key,preview,restored]);
  return [preview,setPreview,error] as const;
}
