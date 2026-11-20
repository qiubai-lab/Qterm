import { registerRuntimeFlush } from "../remoteRuntime/switchGuard";
import { useWorkbenchActive } from "../workspace/workbenchActivity";
import { createFileDraftWriter } from "./fileDraftWriter";
import { useEffect,useState } from "react";
import { loadPaneState,savePaneState } from "@qterm/services/paneState";
import { readBinaryFile } from "@qterm/services/files";
import { isServer } from "../lib/runtime/environment";
import type { FileRuntime } from "../workspace/workspaceRuntime";
import type { FilePreviewState } from "./FilePreviewDocument";
import { imageMime } from "./fileBrowserModel";

export function useRetainedFilePreview(key:string|undefined,runtime:FileRuntime) {
  const enabled = useWorkbenchActive();
  const [preview,setPreview]=useState<FilePreviewState|null>(null);
  const [restored,setRestored]=useState(!isServer || !key);
  const [error,setError]=useState("");
  const [writer] = useState(() => createFileDraftWriter(savePaneState));
  useEffect(()=>{
    if(!enabled || !isServer || !key || restored || (runtime.kind==="sftp" && runtime.status!=="connected"))return;
    let active=true;
    void loadPaneState(key).then(async value=>{
      const saved=value as FilePreviewState|null;
      writer.restore(value);
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
  },[enabled,key,restored,runtime.kind,runtime.sessionId,runtime.status,writer]);
  useEffect(()=>{
    if(!enabled || !isServer || !key || !restored || preview?.loading)return;
    const value=preview?{...preview,imageUrl:"",error:""}:null;
    let current = true;
    void writer.save(key, value).then(() => { if (current) setError(""); }, reason => {
      if (current) setError(reason instanceof Error ? reason.message : "草稿尚未同步到服务端，请保持页面打开");
    });
    return () => { current = false; };
  },[enabled,key,preview,restored,writer]);
  useEffect(() => registerRuntimeFlush(async () => {
    if (!isServer) {
      if (preview && preview.content !== preview.original) throw new Error("请先保存或关闭本机文件编辑，再切换环境");
      return;
    }
    if (!restored && preview && preview.content !== preview.original) throw new Error("文件草稿尚未恢复，无法同步修改");
    if (!key || !restored || preview?.loading) return;
    const value = preview ? {...preview,imageUrl:"",error:""} : null;
    if (writer.synced(value)) return;
    if (!enabled) throw new Error("草稿尚未同步，请恢复连接并解锁后再试");
    await writer.save(key, value);
  }), [enabled, key, preview, restored, writer]);
  return [preview,setPreview,error] as const;
}
