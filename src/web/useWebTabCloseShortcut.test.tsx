import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWebTabCloseShortcut } from "./useWebTabCloseShortcut";

const native = vi.hoisted(() => ({
  platform: vi.fn(() => "macos"), source: vi.fn<(label: string) => string | null>(() => "browser"),
  stop: vi.fn(), subscribe: vi.fn<(receive: (source: string | null) => void) => () => void>(),
}));
vi.mock("../lib/tauri/window", () => ({ currentDesktopPlatform: native.platform }));
vi.mock("../lib/tauri/blockClose", () => ({ subscribeNativeWebTabClose: native.subscribe }));
vi.mock("./surface/nativeSurfaceCoordinator", () => ({ nativeSurfaceBlockId: native.source }));
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.clearAllMocks(); native.platform.mockReturnValue("macos"); native.source.mockReturnValue("browser"); });

function mount(active = true, visible = true) {
  native.subscribe.mockReturnValue(native.stop);
  const close = vi.fn();
  const view = renderHook(props => useWebTabCloseShortcut(props), { initialProps: { blockId: "browser", active, visible, close } });
  return { ...view, close, deliver: native.subscribe.mock.calls[0]?.[0] };
}

describe("browser tab close shortcuts", () => {
  it("uses native source ownership and latest callback, and disposes the subscription", () => {
    const view = mount();
    act(() => view.deliver(null));
    native.source.mockReturnValue(null); act(() => view.deliver("stale"));
    native.source.mockReturnValue("other"); act(() => view.deliver("other"));
    expect(view.close).not.toHaveBeenCalled();
    const next = vi.fn();
    view.rerender({ blockId: "browser", active: true, visible: true, close: next });
    native.source.mockReturnValue("browser"); act(() => view.deliver("web-current"));
    expect(next).toHaveBeenCalledOnce(); expect(view.close).not.toHaveBeenCalled();
    expect(native.subscribe).toHaveBeenCalledOnce();
    view.unmount(); expect(native.stop).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { code: "KeyW", ctrlKey: true }); expect(next).toHaveBeenCalledOnce();
  });

  it.each(["inactive", "hidden", "dialog", "menu", "lock"])("rejects DOM and native closes when %s", state => {
    const view = mount(state !== "inactive", state !== "hidden");
    const guard = document.createElement("div");
    if (state === "dialog" || state === "menu") guard.setAttribute("role", state);
    if (state === "lock") guard.className = "terminal-lock-screen";
    document.body.append(guard);
    fireEvent.keyDown(window, { key: "w", code: "KeyW", ctrlKey: true });
    act(() => view.deliver("web-current")); expect(view.close).not.toHaveBeenCalled();
  });

  it("requires Ctrl+W without repeat, composition or extra modifiers", () => {
    const view = mount();
    for (const extra of [{ repeat: true }, { isComposing: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) {
      fireEvent.keyDown(window, { key: "w", code: "KeyW", ctrlKey: true, ...extra });
    }
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.keyDown(window, { key: "w", metaKey: true });
    fireEvent.keyDown(window, { key: "∑", code: "KeyW", altKey: true });
    expect(view.close).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "w", code: "KeyW", ctrlKey: true });
    expect(view.close).toHaveBeenCalledOnce();
    view.unmount();
    native.platform.mockReturnValue("windows");
    const windows = mount();
    fireEvent.keyDown(window, { key: "w", code: "KeyW", ctrlKey: true });
    expect(windows.close).toHaveBeenCalledOnce();
  });
});
