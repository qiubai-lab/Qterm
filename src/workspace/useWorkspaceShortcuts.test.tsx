import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LayoutLeaf, Workspace } from "./model";
import { useWorkspaceShortcuts } from "./useWorkspaceShortcuts";

const native = vi.hoisted(() => ({ subscribe: vi.fn<(receive: (source: string | null) => void) => () => void>(() => () => undefined), available: vi.fn(() => false), sourceBlock: vi.fn<(label: string) => string | null>(() => null) }));
vi.mock("../lib/tauri/blockClose", () => ({ subscribeNativeBlockClose: native.subscribe, hasNativeBlockClose: native.available }));

vi.mock("../web/surface/nativeSurfaceCoordinator", () => ({ nativeSurfaceBlockId: native.sourceBlock }));

const workspace: Workspace = {
  id: "workspace", name: "Workspace", activeBlockId: "terminal-2",
  layout: {
    type: "split", id: "split", direction: "horizontal", ratio: 0.5,
    first: { type: "terminal", blockId: "terminal-1", profileId: null, restoreDirectory: null },
    second: { type: "terminal", blockId: "terminal-2", profileId: null, restoreDirectory: null },
  },
};

afterEach(() => { cleanup(); document.body.replaceChildren(); native.subscribe.mockClear(); native.available.mockReturnValue(false); native.sourceBlock.mockReset(); vi.restoreAllMocks(); });

describe("workspace close shortcut protection", () => {
  it.each(["repeat", "modal", "dialog", "menu", "locked", "input"])("consumes Ctrl+W without closing during %s", (state) => {
    const onCloseBlock = vi.fn();
    renderHook(() => useWorkspaceShortcuts({
      platform: "windows", activeWorkspace: workspace, workspaces: [workspace],
      modalOpen: state === "modal", terminalLocked: state === "locked",
      onCloseBlock, onSelectWorkspace: vi.fn(),
    }));
    const target = document.createElement(state === "input" ? "input" : "div");
    if (state === "dialog" || state === "menu") target.setAttribute("role", state);
    document.body.append(target);
    expect(fireEvent.keyDown(target, { key: "w", ctrlKey: true, repeat: state === "repeat" })).toBe(false);
    expect(onCloseBlock).not.toHaveBeenCalled();
  });

  it("closes a files block while preserving the last terminal", () => {
    const onCloseBlock = vi.fn();
    const mixed: Workspace = { ...workspace, activeBlockId: "files", layout: {
      type: "split", id: "split", direction: "horizontal", ratio: 0.5,
      first: { type: "terminal", blockId: "terminal-1", profileId: null, restoreDirectory: null },
      second: { type: "files", blockId: "files", profileId: null, path: "~" },
    } };
    const { rerender } = renderHook(({ current }) => useWorkspaceShortcuts({
      platform: "linux", activeWorkspace: current, workspaces: [current],
      modalOpen: false, terminalLocked: false, onCloseBlock, onSelectWorkspace: vi.fn(),
    }), { initialProps: { current: mixed } });
    expect(fireEvent.keyDown(window, { key: "w", ctrlKey: true })).toBe(false);
    expect(onCloseBlock).toHaveBeenCalledExactlyOnceWith("files");
    rerender({ current: { ...mixed, activeBlockId: "terminal-1" } });
    expect(fireEvent.keyDown(window, { key: "w", ctrlKey: true })).toBe(false);
    expect(onCloseBlock).toHaveBeenCalledOnce();
  });

  const leaves: LayoutLeaf[] = [
    { type: "terminal", blockId: "current", profileId: null, restoreDirectory: null },
    { type: "files", blockId: "current", profileId: null, path: "~" },
    { type: "network", blockId: "current", profileId: null },
    { type: "git", blockId: "current", target: { type: "local", path: "/repo" } },
    { type: "web", blockId: "current", profileId: null },
  ];
  it.each(leaves)("routes active $type block shortcuts while reserving browser Ctrl+W for tabs", (leaf) => {
    const onCloseBlock = vi.fn();
    const current: Workspace = { ...workspace, activeBlockId: "current", layout: {
      type: "split", id: "split", direction: "horizontal", ratio: 0.5,
      first: { type: "terminal", blockId: "kept", profileId: null, restoreDirectory: null }, second: leaf,
    } };
    renderHook(() => useWorkspaceShortcuts({
      platform: "macos", activeWorkspace: current, workspaces: [current],
      modalOpen: false, terminalLocked: false, onCloseBlock, onSelectWorkspace: vi.fn(),
    }));
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    if (leaf.type === "web") expect(onCloseBlock).not.toHaveBeenCalled();
    else expect(onCloseBlock).toHaveBeenCalledExactlyOnceWith("current");
    act(() => native.subscribe.mock.calls[0][0](null));
    expect(onCloseBlock).toHaveBeenCalledTimes(leaf.type === "web" ? 1 : 2);
    expect(onCloseBlock).toHaveBeenLastCalledWith("current");
  });

  it("routes native Cmd+W once using current state and ignores the matching DOM shortcut", () => {
    native.available.mockReturnValue(true);
    const onCloseBlock = vi.fn();
    const { rerender } = renderHook(({ current }) => useWorkspaceShortcuts({
      platform: "macos", activeWorkspace: current, workspaces: [current],
      modalOpen: false, terminalLocked: false, onCloseBlock, onSelectWorkspace: vi.fn(),
    }), { initialProps: { current: workspace } });
    const deliver = native.subscribe.mock.calls[0][0] as unknown as () => void;
    expect(fireEvent.keyDown(window, { key: "w", metaKey: true })).toBe(false);
    expect(onCloseBlock).not.toHaveBeenCalled();
    act(() => deliver());
    expect(onCloseBlock).toHaveBeenCalledExactlyOnceWith("terminal-2");
    rerender({ current: { ...workspace, activeBlockId: "terminal-1" } });
    act(() => deliver());
    expect(onCloseBlock).toHaveBeenLastCalledWith("terminal-1");
    expect(native.subscribe).toHaveBeenCalledOnce();
  });

  it.each(["modal", "dialog", "menu", "locked", "input", "last", "missing"])("blocks native close during %s", (state) => {
    const onCloseBlock = vi.fn();
    const current = state === "last" ? { ...workspace, layout: { type: "terminal" as const, blockId: "terminal-2", profileId: null, restoreDirectory: null } }
      : state === "missing" ? { ...workspace, activeBlockId: "files" } : workspace;
    renderHook(() => useWorkspaceShortcuts({
      platform: "macos", activeWorkspace: current, workspaces: [current],
      modalOpen: state === "modal", terminalLocked: state === "locked", onCloseBlock, onSelectWorkspace: vi.fn(),
    }));
    const target = document.createElement(state === "input" ? "input" : "div");
    if (state === "dialog" || state === "menu") target.setAttribute("role", state);
    document.body.append(target);
    if (state === "input") target.focus();
    const deliver = native.subscribe.mock.calls[0][0] as unknown as () => void;
    act(() => deliver());
    expect(onCloseBlock).not.toHaveBeenCalled();
  });

  it("rejects stale guest sources and ignores stale host input focus while a web guest is active", () => {
    const onCloseBlock = vi.fn();
    const current: Workspace = { ...workspace, activeBlockId: "browser", layout: {
      type: "split", id: "split", direction: "horizontal", ratio: 0.5,
      first: { type: "terminal", blockId: "kept", profileId: null, restoreDirectory: null },
      second: { type: "web", blockId: "browser", profileId: null },
    } };
    renderHook(() => useWorkspaceShortcuts({ platform: "windows", activeWorkspace: current, workspaces: [current],
      modalOpen: false, terminalLocked: false, onCloseBlock, onSelectWorkspace: vi.fn() }));
    const input = document.createElement("input"); document.body.append(input); input.focus();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const deliver = native.subscribe.mock.calls[0][0];
    native.sourceBlock.mockReturnValue(null);
    act(() => deliver("web-stale"));
    native.sourceBlock.mockReturnValue("other");
    act(() => deliver("web-other"));
    expect(onCloseBlock).not.toHaveBeenCalled();
    native.sourceBlock.mockReturnValue("browser");
    act(() => deliver("web-current"));
    expect(onCloseBlock).toHaveBeenCalledExactlyOnceWith("browser");
    vi.mocked(document.hasFocus).mockReturnValue(true);
    act(() => deliver(null));
    expect(onCloseBlock).toHaveBeenCalledOnce();
  });

  it("uses the latest active workspace and removes its listener on unmount", () => {
    const onCloseBlock = vi.fn();
    const { rerender, unmount } = renderHook(({ current }) => useWorkspaceShortcuts({
      platform: "macos", activeWorkspace: current, workspaces: [current],
      modalOpen: false, terminalLocked: false, onCloseBlock, onSelectWorkspace: vi.fn(),
    }), { initialProps: { current: workspace } });
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    expect(onCloseBlock).toHaveBeenLastCalledWith("terminal-2");
    rerender({ current: { ...workspace, activeBlockId: "terminal-1" } });
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    expect(onCloseBlock).toHaveBeenLastCalledWith("terminal-1");
    unmount();
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    expect(onCloseBlock).toHaveBeenCalledTimes(2);
  });
});
