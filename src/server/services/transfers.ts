import { dataLease } from "../dataAccess";
import type * as Desktop from "../../lib/tauri/transfers";
import { API, api, message } from "../http";
import { selectUpload, takeUpload, type UploadEntry } from "../uploadSelection";
import { uploadRequest } from "../uploadRequest";
const tasks = new Map<string, { controller: AbortController; active: Set<string> }>();
export type * from "../../lib/tauri/transfers";
export const selectUploadFiles: typeof Desktop.selectUploadFiles = () => selectUpload(false);
export const selectUploadFile: typeof Desktop.selectUploadFile = async () => (await selectUpload(false, false))[0] ?? null;
export const selectUploadFolder: typeof Desktop.selectUploadFolder = async () => (await selectUpload(true))[0] ?? null;
export const selectDownloadPath: typeof Desktop.selectDownloadPath = async name => name ?? "qterm-download";
export const selectDownloadDirectory: typeof Desktop.selectDownloadDirectory = async name => `${name}.tar`;
function start(onEvent: (event: Desktop.TransferEvent) => void, operation: (signal: AbortSignal, active: Set<string>) => Promise<void>, totalBytes = 0): string {
  const lease = dataLease();
  const id = crypto.randomUUID(); const controller = new AbortController(); const active = new Set<string>(); tasks.set(id, { controller, active });
  onEvent({ type: "started", totalBytes });
  void operation(AbortSignal.any([controller.signal, lease.signal]), active).then(() => onEvent({ type: "completed" }), error => onEvent(controller.signal.aborted ? { type: "cancelled" } : { type: "failed", message: message(error) })).finally(() => tasks.delete(id));
  return id;
}
async function upload(sessionId: string, entry: UploadEntry, path: string, relative: boolean, signal: AbortSignal, active: Set<string>, progress: (bytes: number) => void) {
  const body = new FormData(); body.append("file", entry.file ?? new Blob([]));
  const taskId = crypto.randomUUID(); active.add(taskId);
  const query = new URLSearchParams({ sessionId, path, taskId });
  if (relative) query.set("relativePath", entry.path);
  if (!entry.file) query.set("directory", "true");
  try { await uploadRequest(`/transfers/upload?${query}`, body, taskId, entry.file?.size ?? 0, signal, progress); } finally { active.delete(taskId); }
}
export const uploadFile: typeof Desktop.uploadFile = async (session, id, path, onEvent) => {
  const entries = takeUpload(id);
  if (entries.length !== 1 || !entries[0].file) throw new Error("请选择单个文件");
  return start(onEvent, (signal, active) => upload(session, entries[0], path, false, signal, active, bytes => onEvent({type:"progress",transferredBytes:bytes,totalBytes:entries[0].file!.size})), entries[0].file.size);
};
export const uploadSelectedEntries: typeof Desktop.uploadSelectedEntries = async (session, ids, directory, onEvent) => {
  const entries = ids.flatMap(takeUpload), totalBytes = entries.reduce((sum,e)=>sum+(e.file?.size ?? 0),0);
  return start(onEvent, async (signal, active) => {
    let transferredBytes = 0;
    for (const entry of entries) {
      signal.throwIfAborted(); await upload(session, entry, directory, true, signal, active, bytes => onEvent({type:"progress",transferredBytes:transferredBytes+bytes,totalBytes}));
      transferredBytes += entry.file?.size ?? 0; onEvent({type:"progress", transferredBytes, totalBytes});
    }
  }, totalBytes);
};
async function download(sessionId: string, path: string, name: string, directory: boolean, onEvent: (event: Desktop.TransferEvent) => void): Promise<string> { return start(onEvent, async (signal, active) => {
  const taskId = crypto.randomUUID(); active.add(taskId);
  let id: string;
  try { ({ id } = await api<{ id: string }>("/transfers/download", "POST", { sessionId, path, taskId, directory }, signal)); } finally { active.delete(taskId); }
  signal.throwIfAborted();
  const link = document.createElement("a"); link.href = `${API}/downloads/${encodeURIComponent(id)}`; link.download = name; document.body.append(link); link.click(); link.remove();
}); }
export const downloadFile: typeof Desktop.downloadFile = (session, path, name, events) => download(session,path,name,false,events);
export const cancelTransfer: typeof Desktop.cancelTransfer = async (_session, id) => {
  const task = tasks.get(id); if (!task) return;
  const pending = [...task.active].map(activeId => api(`/transfers/${activeId}/cancel`, "POST"));
  task.controller.abort();
  await Promise.all(pending);
};
export const uploadDroppedEntries: typeof Desktop.uploadDroppedEntries = uploadSelectedEntries;
export const downloadDirectory: typeof Desktop.downloadDirectory = (session,path,name,events) => download(session,path,name,true,events);
