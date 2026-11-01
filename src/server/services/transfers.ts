import type * as Desktop from "../../lib/tauri/transfers";
import { API, api, message, request, unsupported } from "../http";
const files = new Map<string, File>();
const tasks = new Map<string, { controller: AbortController; active: Set<string> }>();
export type * from "../../lib/tauri/transfers";

function select(multiple: boolean): Promise<string[]> {
  return new Promise(resolve => {
    const input = document.createElement("input"); input.type = "file"; input.multiple = multiple;
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.addEventListener("change", () => {
      files.clear(); const ids = Array.from(input.files ?? []).map(file => { const id = `${crypto.randomUUID()}/${file.name}`; files.set(id, file); return id; }); resolve(ids);
    }, { once: true }); input.click();
  });
}
export const selectUploadFiles: typeof Desktop.selectUploadFiles = () => select(true);
export const selectUploadFile: typeof Desktop.selectUploadFile = async () => (await select(false))[0] ?? null;
export const selectUploadFolder: typeof Desktop.selectUploadFolder = async () => unsupported();
export const selectDownloadPath: typeof Desktop.selectDownloadPath = async name => name ?? "qterm-download";
export const selectDownloadDirectory: typeof Desktop.selectDownloadDirectory = async () => unsupported();
function start(onEvent: (event: Desktop.TransferEvent) => void, operation: (signal: AbortSignal, active: Set<string>) => Promise<void>): string {
  const id = crypto.randomUUID(); const controller = new AbortController(); const active = new Set<string>(); tasks.set(id, { controller, active });
  onEvent({ type: "started", totalBytes: 0 });
  void operation(controller.signal, active).then(() => onEvent({ type: "completed" }), error => onEvent(controller.signal.aborted ? { type: "cancelled" } : { type: "failed", message: message(error) })).finally(() => tasks.delete(id));
  return id;
}
async function upload(sessionId: string, id: string, path: string, signal: AbortSignal, active: Set<string>) {
  const file = files.get(id); files.delete(id); if (!file) throw new Error("请重新选择上传文件");
  if (file.size > 128 * 1024 * 1024) throw new Error("单文件上限为 128 MiB");
  const body = new FormData(); body.append("file", file);
  const taskId = crypto.randomUUID(); active.add(taskId);
  try { await request(`/transfers/upload?${new URLSearchParams({ sessionId, path, taskId })}`, { method: "POST", body, signal }); } finally { active.delete(taskId); }
}
export const uploadFile: typeof Desktop.uploadFile = async (session, id, path, onEvent) => start(onEvent, (signal, active) => upload(session, id, path, signal, active));
export const uploadSelectedEntries: typeof Desktop.uploadSelectedEntries = async (session, ids, directory, onEvent) => start(onEvent, async (signal, active) => {
  for (const id of ids) { const file = files.get(id); if (!file) throw new Error("请重新选择上传文件"); await upload(session, id, `${directory.replace(/\/$/, "")}/${file.name}`, signal, active); }
});
export const downloadFile: typeof Desktop.downloadFile = async (sessionId, path, name, onEvent) => start(onEvent, async (signal, active) => {
  const taskId = crypto.randomUUID(); active.add(taskId);
  let id: string;
  try { ({ id } = await api<{ id: string }>("/transfers/download", "POST", { sessionId, path, taskId }, signal)); } finally { active.delete(taskId); }
  signal.throwIfAborted();
  const link = document.createElement("a"); link.href = `${API}/downloads/${encodeURIComponent(id)}`; link.download = name; document.body.append(link); link.click(); link.remove();
});
export const cancelTransfer: typeof Desktop.cancelTransfer = async (_session, id) => {
  const task = tasks.get(id); if (!task) return;
  const pending = [...task.active].map(activeId => api(`/transfers/${activeId}/cancel`, "POST"));
  task.controller.abort();
  await Promise.all(pending);
};
export const uploadDroppedEntries: typeof Desktop.uploadDroppedEntries = async () => unsupported();
export const downloadDirectory: typeof Desktop.downloadDirectory = async () => unsupported();
