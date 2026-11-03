import { isRemoteDesktop } from "../lib/runtime/environment";
import { cancelNativeDownload, selectNativeDownload, streamNativeDownload } from "../remoteRuntime/download";
import type { TransferEvent } from "../lib/contracts/transfers";
import { API, api, request } from "./http";
import { dataLease } from "./dataAccess";
import { randomId } from "../lib/randomId";

export async function selectDownloadDestination(name: string): Promise<string | null> {
  if (!isRemoteDesktop) return name;
  const lease = dataLease();
  const id = await selectNativeDownload(name);
  try { lease.check(); return id; }
  catch (error) { if (id) await cancelNativeDownload(id).catch(() => undefined); throw error; }
}

export async function discardDownloadDestination(id: string) {
  if (isRemoteDesktop) await cancelNativeDownload(id).catch(() => undefined);
}

/** Preparation belongs to Qterm; browser handoff is not a completed save. */
export async function downloadRequest(sessionId: string, path: string, destination: string, directory: boolean, signal: AbortSignal, active: Set<string>, onEvent: (event: TransferEvent) => void): Promise<boolean> {
  const taskId = randomId(); active.add(taskId);
  const polling = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let preparing = true;
  async function poll() {
    try {
      const value = await api<{transferredBytes:number;totalBytes:number}>(`/transfers/${taskId}/progress`, "GET", undefined, AbortSignal.any([signal,polling.signal]));
      if (preparing && !signal.aborted) onEvent({type:"progress",...value,message:"正在准备下载…"});
    } catch { /* Registration may lag polling. The download request owns errors. */ }
    if (preparing && !signal.aborted) timer = setTimeout(() => void poll(), 250);
  }
  onEvent({type:"progress",transferredBytes:0,totalBytes:0,message:"正在准备下载…"});
  void poll();
  try {
    const {id} = await api<{id:string}>("/transfers/download", "POST", {sessionId,path,taskId,directory}, signal);
    preparing = false; clearTimeout(timer); polling.abort(); active.delete(taskId);
    signal.throwIfAborted();
    if (isRemoteDesktop) {
      const response = await request(`/downloads/${encodeURIComponent(id)}`, {signal});
      await streamNativeDownload(response, destination, signal, (transferredBytes,totalBytes) => onEvent({type:"progress",transferredBytes,totalBytes,message:"正在保存到本机…"}));
      return true;
    }
    const link = document.createElement("a");
    link.href = `${API}/downloads/${encodeURIComponent(id)}`; link.download = destination;
    document.body.append(link); link.click(); link.remove();
    onEvent({type:"handedOff"});
    return false;
  } catch (error) {
    await discardDownloadDestination(destination);
    throw error;
  } finally { preparing = false; clearTimeout(timer); polling.abort(); active.delete(taskId); }
}
