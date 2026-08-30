import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppTheme } from "./settings";

export type DesktopPlatform = "macos" | "windows" | "linux";

export function currentDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "linux";
  const navigatorWithData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const value = `${navigatorWithData.userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  if (value.includes("mac")) return "macos";
  if (value.includes("win")) return "windows";
  return "linux";
}

export async function minimizeCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().minimize();
}

export async function toggleMaximizeCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().toggleMaximize();
}

export async function isCurrentWindowAlwaysOnTop(): Promise<boolean> {
  return isTauriRuntime() ? getCurrentWindow().isAlwaysOnTop() : false;
}

export async function setCurrentWindowAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().setAlwaysOnTop(alwaysOnTop);
}

export async function closeCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().close();
}

export async function startDraggingCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().startDragging();
}

export async function setNativeWindowTheme(theme: AppTheme): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().setTheme(theme === "light" ? "light" : "dark");
}

export async function registerCurrentWindowCloseFlush(flush: () => Promise<void>): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;
  const currentWindow = getCurrentWindow();
  return currentWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    try {
      await flush();
    } finally {
      await currentWindow.destroy();
    }
  });
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
