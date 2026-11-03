import { selectedRuntime } from "../../remoteRuntime/selection";
/** Build-selected capability. Never infer demo mode from a failed native request. */
export const isDemo = typeof __QTERM_DEMO__ !== "undefined" && __QTERM_DEMO__;
export const isRemoteDesktop = selectedRuntime !== null;
export const isServer = isRemoteDesktop || (typeof __QTERM_SERVER__ !== "undefined" && __QTERM_SERVER__);
export const supportsLocalSessions = true;

export function hasWorkspaceRuntime(): boolean {
  return isDemo || isServer || (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
}

export const supportsNativeTools = !isDemo && !isServer;
