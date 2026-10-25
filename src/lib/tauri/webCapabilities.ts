import { invoke } from "@tauri-apps/api/core";
import { isDemo } from "../runtime/environment";

let local = false;
let remote = false;
let tunnelAddressMapping = false;
/** Resolve native capabilities before React mounts. Never infer authority from the UA. */
export async function bootstrapWebCapabilities(): Promise<void> {
  local = false;
  remote = false;
  tunnelAddressMapping = false;
  if (isDemo || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const value = await invoke<{ local?: unknown; remote?: unknown; tunnelAddressMapping?: unknown } | null>("web_supported");
    local = value?.local === true;
    remote = local && value?.remote === true;
    tunnelAddressMapping = remote && value?.tunnelAddressMapping === true;
  } catch { /* Unsupported runtimes fail closed. */ }
}
export function nativeWebSupported(remoteTarget = false): boolean { return remoteTarget ? remote : local; }

export function usesTunnelAddressMapping(): boolean { return tunnelAddressMapping; }
