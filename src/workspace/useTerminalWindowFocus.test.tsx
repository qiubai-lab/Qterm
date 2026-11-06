import { act, cleanup, render, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { registerTerminalController } from "../terminal/terminalViewRegistry";
import type { Workspace } from "./model";
import { useTerminalWindowFocus } from "./useTerminalWindowFocus";

const workspace: Workspace = {
  id: "ws", name: "Workspace", activeBlockId: "shell",
  layout: { type: "terminal", blockId: "shell", profileId: null, restoreDirectory: null },
};
const native = vi.hoisted(() => ({ subscribe: vi.fn(), enabled: false }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.enabled }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onFocusChanged: native.subscribe }) }));

afterEach(() => { cleanup(); native.enabled = false; });

it("delivers the first character after window activation to the selected terminal", async () => {
  const view = render(<><button>终端标题</button><textarea aria-label="终端输入" /></>);
  const input = view.getByRole("textbox");
  const unregister = registerTerminalController("shell", { focus: () => input.focus(), openSearch: vi.fn() });
  try {
    renderHook(() => useTerminalWindowFocus(workspace, true));
    view.getByRole("button").focus();
    window.dispatchEvent(new Event("focus"));
    await userEvent.keyboard("a");
    expect(input).toHaveValue("a");
  } finally { unregister(); }
});

it("preserves search and overlay focus and skips a locked or non-terminal workspace", () => {
  const focus = vi.fn();
  const unregister = registerTerminalController("shell", { focus, openSearch: vi.fn() });
  try {
    const view = render(<input aria-label="终端搜索" />);
    const hook = renderHook(({ current, enabled }) => useTerminalWindowFocus(current, enabled),
      { initialProps: { current: workspace, enabled: true } });
    const activate = () => window.dispatchEvent(new Event("focus"));
    view.getByRole("textbox").focus();
    activate();
    for (const role of ["dialog", "menu"]) {
      view.rerender(<div role={role} />);
      activate();
    }
    view.unmount();
    hook.rerender({ current: workspace, enabled: false });
    activate();
    hook.rerender({ current: { ...workspace, layout: { type: "web", blockId: "shell", profileId: null } }, enabled: true });
    activate();
    expect(focus).not.toHaveBeenCalled();
  } finally { unregister(); }
});

it("handles native activation and releases a late subscription after unmount", async () => {
  native.enabled = true;
  const stop = vi.fn();
  native.subscribe.mockResolvedValue(stop);
  const focus = vi.fn();
  const unregister = registerTerminalController("shell", { focus, openSearch: vi.fn() });
  try {
    const hook = renderHook(() => useTerminalWindowFocus(workspace, true));
    const notify = native.subscribe.mock.lastCall![0];
    notify({ payload: false });
    expect(focus).not.toHaveBeenCalled();
    notify({ payload: true });
    expect(focus).toHaveBeenCalledOnce();
    hook.unmount();
    notify({ payload: true });
    window.dispatchEvent(new Event("focus"));
    await act(async () => {});
    expect(stop).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  } finally { unregister(); }
});
