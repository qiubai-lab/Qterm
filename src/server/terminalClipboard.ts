import type { TerminalClipboardInput, TerminalClipboardPasteStart, TerminalStagingEvent } from "../lib/contracts/sessions";
import { api } from "./http";
import { uploadRequest } from "./uploadRequest";
const tasks = new Map<string, {session:string;controller:AbortController}>();

export async function readClipboard(): Promise<TerminalClipboardInput> {
  if (!navigator.clipboard?.read) {
    if (!navigator.clipboard?.readText) throw new Error("浏览器无法读取剪贴板，请使用 Ctrl+V 粘贴");
    return {files:[],text:await navigator.clipboard.readText()};
  }
  const items = await navigator.clipboard.read();
  const files: File[] = [];
  let text = "";
  for (const item of items) {
    if (item.types.includes("text/plain")) text += await (await item.getType("text/plain")).text();
    const image = item.types.find(type => type.startsWith("image/"));
    if (image) files.push(new File([await item.getType(image)], `clipboard-${files.length+1}.${image.split("/")[1].replace("jpeg","jpg")}`, {type:image}));
  }
  return {files,text};
}
export async function startClipboard(session: string, onEvent: (event: TerminalStagingEvent) => void, input?: TerminalClipboardInput): Promise<TerminalClipboardPasteStart> {
  const data = input ?? await readClipboard();
  if (!data.files.length) return data.text ? {kind:"text",text:data.text} : {kind:"empty"};
  const totalBytes = data.files.reduce((sum,file)=>sum+file.size,0);
  if (data.files.length > 128 || totalBytes > 128*1024*1024) throw new Error("一次粘贴最多 128 个文件、128 MiB");
  const taskId = crypto.randomUUID(), controller = new AbortController();
  const body = new FormData();
  for (const file of data.files) body.append("file", file, file.name);
  tasks.set(taskId, {session,controller});
  onEvent({type:"started",totalBytes,itemCount:data.files.length,displayName:data.files[0].name});
  const query = new URLSearchParams({sessionId:session,taskId});
  void uploadRequest<{remotePaths:string[]}>(`/terminal/clipboard?${query}`,body,taskId,totalBytes,controller.signal,
    transferredBytes => onEvent({type:"progress",transferredBytes,totalBytes}))
    .then(result => onEvent(controller.signal.aborted ? {type:"cancelled"} : {type:"completed",remotePaths:result.remotePaths}),
      () => onEvent(controller.signal.aborted ? {type:"cancelled"} : {type:"failed"}))
    .finally(() => tasks.delete(taskId));
  return {kind:"transfer",taskId};
}
export async function cancelClipboard(session: string, taskId: string): Promise<void> {
  const task=tasks.get(taskId);
  if (!task || task.session !== session) return;
  const pending=api(`/transfers/${taskId}/cancel`,"POST");
  task.controller.abort();
  await pending;
}
