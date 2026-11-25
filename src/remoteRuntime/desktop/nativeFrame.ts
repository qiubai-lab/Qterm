import { framePort } from "./frame";

// On platforms that inject IPC only in the main document, invoke through its
// callback registry. Only the same-origin, bundled workbench has a FramePort.
if (framePort) {
  const parent = window.parent;
  for (const key of ["__TAURI_INTERNALS__", "__TAURI_EVENT_PLUGIN_INTERNALS__", "isTauri"] as const) {
    if (!(key in window) && key in parent) Object.defineProperty(window, key, { value: Reflect.get(parent, key) });
  }
}
