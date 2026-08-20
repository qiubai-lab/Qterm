import { getCurrentWindow } from "@tauri-apps/api/window";

export async function minimizeCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().minimize();
}

export async function toggleMaximizeCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().toggleMaximize();
}

export async function closeCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().close();
}

export async function startDraggingCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().startDragging();
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
