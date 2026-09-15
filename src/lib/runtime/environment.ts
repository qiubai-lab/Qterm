/** Build-selected capability. Never infer demo mode from a failed native request. */
export const isDemo = typeof __QTERM_DEMO__ !== "undefined" && __QTERM_DEMO__;

export function hasWorkspaceRuntime(): boolean {
  return isDemo || (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
}

export const supportsNativeTools = !isDemo;
