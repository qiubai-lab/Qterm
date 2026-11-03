import { invoke } from "@tauri-apps/api/core";
import type { TerminalClipboardInput } from "../lib/contracts/sessions";
export async function readNativeClipboard(): Promise<TerminalClipboardInput> {
  const snapshot = await invoke<{text:string; files: {name:string;data:string}[]}>("remote_runtime_clipboard");
  return {text:snapshot.text, files:snapshot.files.map(file => new File([Uint8Array.from(atob(file.data), char => char.charCodeAt(0))], file.name))};
}
