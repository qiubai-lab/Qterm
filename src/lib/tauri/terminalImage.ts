import { invoke } from "@tauri-apps/api/core";

export async function saveTerminalImage(blob: Blob): Promise<string | null> {
  return invoke<string | null>("terminal_image_save", new Uint8Array(await blob.arrayBuffer()));
}
