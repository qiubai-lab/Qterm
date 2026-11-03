import { invoke } from "@tauri-apps/api/core";
export async function connectRuntime(endpoint: string): Promise<string> {
  return (await invoke<{apiBase: string}>("remote_runtime_connect", { endpoint })).apiBase;
}
export const disconnectRuntime = () => invoke<void>("remote_runtime_disconnect");
export async function saveNativeDownload(response: Response, name: string, validate: () => void = () => undefined): Promise<void> {
  const data = new Uint8Array(await response.arrayBuffer());
  validate();
  const saved = await invoke<boolean>("remote_runtime_save", data, { headers: { "x-file-name-base64": btoa(String.fromCharCode(...new TextEncoder().encode(name))) } });
  if (!saved) throw new Error("已取消保存文件");
}
