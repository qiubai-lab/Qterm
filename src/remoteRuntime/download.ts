import { invoke } from "@tauri-apps/api/core";
export const selectNativeDownload = (name: string) => invoke<string | null>("remote_download_select", {name});
export const cancelNativeDownload = (id: string) => invoke<void>("remote_download_cancel", {id});
/** Backpressure spans network reads and bounded native writes; never buffer a file. */
export async function streamNativeDownload(response: Response, id: string, signal: AbortSignal, progress: (bytes: number, total: number) => void) {
  const reader = response.body?.getReader();
  let bytes = 0;
  const total = Number(response.headers.get("content-length")) || 0;
  const abort = () => { void reader?.cancel().catch(() => undefined); void cancelNativeDownload(id).catch(() => undefined); };
  signal.addEventListener("abort", abort, {once:true});
  try {
    signal.throwIfAborted();
    if (!reader) throw new Error("服务器未返回下载内容");
    while (true) {
      signal.throwIfAborted();
      const {done, value} = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      for (let offset = 0; offset < value.length; offset += 64 * 1024) {
        signal.throwIfAborted();
        const chunk = value.subarray(offset, offset + 64 * 1024);
        await invoke<void>("remote_download_write", chunk, {headers:{"x-download-id":id}});
        signal.throwIfAborted();
        bytes += chunk.length; progress(bytes, total);
      }
    }
    if (total && total !== bytes) throw new Error("下载连接中断，文件不完整");
    signal.throwIfAborted();
    await invoke<void>("remote_download_finish", {id});
  } catch (error) {
    await reader?.cancel().catch(() => undefined);
    await cancelNativeDownload(id).catch(() => undefined);
    throw error;
  } finally { signal.removeEventListener("abort", abort); reader?.releaseLock(); }
}
