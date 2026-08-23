import { getCurrentWindow } from "@tauri-apps/api/window";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

import { closeCurrentWindow, currentDesktopPlatform, minimizeCurrentWindow, setNativeWindowTheme, startDraggingCurrentWindow, toggleMaximizeCurrentWindow } from "./window";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe("Tauri window adapter", () => {
  it("detects macOS for native titlebar behavior", () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    expect(currentDesktopPlatform()).toBe("macos");
  });

  it("does not call native window APIs in browser mode", async () => {
    await minimizeCurrentWindow();
    await toggleMaximizeCurrentWindow();
    await closeCurrentWindow();
    await startDraggingCurrentWindow();

    expect(getCurrentWindow).not.toHaveBeenCalled();
  });

  it("maps window controls to the current Tauri window", async () => {
    const minimize = vi.fn();
    const toggleMaximize = vi.fn();
    const close = vi.fn();
    const startDragging = vi.fn();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    vi.mocked(getCurrentWindow).mockReturnValue({ minimize, toggleMaximize, close, startDragging } as unknown as ReturnType<typeof getCurrentWindow>);

    await minimizeCurrentWindow();
    await toggleMaximizeCurrentWindow();
    await closeCurrentWindow();
    await startDraggingCurrentWindow();

    expect(minimize).toHaveBeenCalledOnce();
    expect(toggleMaximize).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(startDragging).toHaveBeenCalledOnce();
  });

  it("maps custom dark presets to the native dark appearance", async () => {
    const setTheme = vi.fn();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    vi.mocked(getCurrentWindow).mockReturnValue({ setTheme } as unknown as ReturnType<typeof getCurrentWindow>);

    await setNativeWindowTheme("light");
    await setNativeWindowTheme("cyberpunk");

    expect(setTheme).toHaveBeenNthCalledWith(1, "light");
    expect(setTheme).toHaveBeenNthCalledWith(2, "dark");
  });
});
