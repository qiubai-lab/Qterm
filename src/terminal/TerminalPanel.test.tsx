import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  terminals: [] as Array<{
    element: HTMLElement | null;
    options: Record<string, unknown>;
    dispose: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    paste: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    selectAll: ReturnType<typeof vi.fn>;
    hasSelection: ReturnType<typeof vi.fn>;
    getSelection: ReturnType<typeof vi.fn>;
    keyHandler: ((event: KeyboardEvent) => boolean) | null;
  }>,
  fits: [] as Array<{ fit: ReturnType<typeof vi.fn>; proposeDimensions: ReturnType<typeof vi.fn> }>,
  registerWriter: vi.fn<(blockId: string, writer: (data: Uint8Array) => void, clearer: (reset: boolean) => void) => () => void>(() => vi.fn()),
  setBlockCwd: vi.fn(),
  startLocalBlock: vi.fn(),
  hydrated: true,
  localTerminalCapabilities: { windowsPty: { backend: "conpty" as const, buildNumber: 26100 } } as { windowsPty: { backend: "conpty"; buildNumber: number } | null } | null,
  writeBlock: vi.fn().mockResolvedValue(undefined),
  clearBlockBuffer: vi.fn(),
  writeClipboardText: vi.fn().mockResolvedValue(undefined),
  readClipboardText: vi.fn().mockResolvedValue(""),
  runtimes: {} as Record<string, { status: string }>,
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: mocks.readClipboardText,
  writeText: mocks.writeClipboardText,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn();
    proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));

    constructor() {
      mocks.fits.push(this);
    }
  },
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    element: HTMLElement | null = null;
    dispose = vi.fn();
    write = vi.fn();
    refresh = vi.fn();
    clear = vi.fn();
    reset = vi.fn();
    paste = vi.fn();
    focus = vi.fn();
    selectAll = vi.fn();
    hasSelection = vi.fn(() => false);
    getSelection = vi.fn(() => "");
    keyHandler: ((event: KeyboardEvent) => boolean) | null = null;
    parser = { registerOscHandler: vi.fn(() => ({ dispose: vi.fn() })) };

    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mocks.terminals.push(this);
    }

    loadAddon() {}

    open(container: HTMLElement) {
      this.element = document.createElement("div");
      this.element.dataset.xtermView = "preserved";
      container.append(this.element);
    }

    onData() {
      return { dispose: vi.fn() };
    }

    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      this.keyHandler = handler;
    }
  },
}));

vi.mock("../workspace/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    registerWriter: mocks.registerWriter,
    setBlockCwd: mocks.setBlockCwd,
    hydrated: mocks.hydrated,
    localTerminalCapabilities: mocks.localTerminalCapabilities,
    startLocalBlock: mocks.startLocalBlock,
    writeBlock: mocks.writeBlock,
    clearBlockBuffer: mocks.clearBlockBuffer,
    runtimes: mocks.runtimes,
    resizeBlock: vi.fn(),
  }),
}));

import { TerminalPanel } from "./TerminalPanel";
import { parseOsc7Cwd } from "./osc7";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function Layout({ split }: { split: boolean }) {
  const terminal = <TerminalPanel blockId="block-1" sessionKey="block-1:local" local={false} visible={false}/>;
  return split ? <div className="split"><div>{terminal}</div><div /></div> : terminal;
}

describe("TerminalPanel view lifetime", () => {
  beforeEach(() => {
    mocks.terminals.length = 0;
    mocks.fits.length = 0;
    mocks.registerWriter.mockClear();
    mocks.startLocalBlock.mockClear();
    mocks.writeBlock.mockClear();
    mocks.clearBlockBuffer.mockClear();
    mocks.writeClipboardText.mockClear();
    mocks.readClipboardText.mockReset().mockResolvedValue("");
    mocks.runtimes = {};
    mocks.hydrated = true;
    mocks.localTerminalCapabilities = { windowsPty: { backend: "conpty", buildNumber: 26100 } };
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("preserves the xterm instance and scrollback when a split reparents the same session", () => {
    const view = render(<Layout split={false}/>);
    expect(mocks.terminals).toHaveLength(1);
    const terminal = mocks.terminals[0];

    view.rerender(<Layout split/>);

    expect(mocks.terminals).toHaveLength(1);
    expect(terminal.dispose).not.toHaveBeenCalled();
    expect(view.container.querySelector("[data-xterm-view=preserved]")).toBe(terminal.element);

    view.unmount();
    act(() => vi.runAllTimers());
    expect(terminal.dispose).toHaveBeenCalledOnce();
  });

  it("restores the transparent theme when a preserved xterm view is reattached", () => {
    const view = render(<TerminalPanel blockId="block-theme" sessionKey="block-theme:local" local={false} visible={false}/>);
    const terminal = mocks.terminals[0];
    terminal.options.theme = { background: "#000000" };
    view.unmount();

    const reattachedView = render(<TerminalPanel blockId="block-theme" sessionKey="block-theme:local" local={false} visible={false}/>);

    expect(mocks.terminals).toHaveLength(1);
    expect(terminal.options.theme).toMatchObject({ background: "#00000000" });
    reattachedView.unmount();
  });

  it("creates a fresh view and disposes the old one when the terminal target changes", () => {
    const view = render(<TerminalPanel blockId="block-1" sessionKey="block-1:local" local={false} visible={false}/>);
    const localTerminal = mocks.terminals[0];

    view.rerender(<TerminalPanel blockId="block-1" sessionKey="block-1:ssh-1" local={false} visible={false}/>);

    expect(mocks.terminals).toHaveLength(2);
    act(() => vi.runAllTimers());
    expect(localTerminal.dispose).toHaveBeenCalledOnce();
    expect(mocks.terminals[1].dispose).not.toHaveBeenCalled();

    view.unmount();
  });

  it("configures a narrow terminal-themed xterm scrollbar", () => {
    const view = render(<TerminalPanel blockId="block-1" sessionKey="block-1:local" local={false} visible={false}/>);
    const options = mocks.terminals[0].options as {
      fontFamily: string;
      fontSize: number;
      lineHeight: number;
      allowTransparency: boolean;
      overviewRuler: { width: number };
      theme: Record<string, string>;
    };

    expect(options.fontFamily).toBe("SFMono-Regular, Menlo, Monaco, Consolas, monospace");
    expect(options.fontSize).toBe(13);
    expect(options.lineHeight).toBe(1.22);
    expect(options.allowTransparency).toBe(true);
    expect(options.theme.background).toBe("#00000000");
    expect(options.overviewRuler.width).toBe(3);
    expect(options.theme.overviewRulerBorder).toBe("#00000000");
    expect(options.theme.scrollbarSliderBackground).toBe("#75e6cf80");
    expect(options.theme.scrollbarSliderHoverBackground).toBe("#75e6cfa6");
    expect(options.theme.scrollbarSliderActiveBackground).toBe("#75e6cfbf");

    view.unmount();
  });

  it("registers the current xterm clear action with the workspace", () => {
    const view = render(<TerminalPanel blockId="block-clear" sessionKey="block-clear:local" local={false} visible/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];
    const clear = mocks.registerWriter.mock.calls[mocks.registerWriter.mock.calls.length - 1]?.[2];

    clear?.(false);

    expect(terminal.clear).toHaveBeenCalledOnce();
    expect(terminal.reset).not.toHaveBeenCalled();
    clear?.(true);
    expect(terminal.reset).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("asks a local ConPTY shell to clear so its cursor stays synchronized with xterm", () => {
    const view = render(<TerminalPanel blockId="block-clear-local" sessionKey="block-clear-local:local" local visible/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];
    const clear = mocks.registerWriter.mock.calls[mocks.registerWriter.mock.calls.length - 1]?.[2];

    clear?.(false);

    expect(mocks.writeBlock).toHaveBeenCalledOnce();
    expect(mocks.writeBlock.mock.calls[0]?.[0]).toBe("block-clear-local");
    expect(Array.from(mocks.writeBlock.mock.calls[0]?.[1] ?? [])).toEqual([27, 99, 108, 115, 13]);
    expect(terminal.clear).not.toHaveBeenCalled();
    expect(terminal.reset).not.toHaveBeenCalled();
    view.unmount();
  });

  it("keeps frontend buffer clearing for a local terminal without ConPTY", () => {
    mocks.localTerminalCapabilities = { windowsPty: null };
    const view = render(<TerminalPanel blockId="block-clear-posix" sessionKey="block-clear-posix:local" local visible/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];
    const clear = mocks.registerWriter.mock.calls[mocks.registerWriter.mock.calls.length - 1]?.[2];

    clear?.(false);

    expect(terminal.clear).toHaveBeenCalledOnce();
    expect(mocks.writeBlock).not.toHaveBeenCalled();
    view.unmount();
  });

  it("configures ConPTY compatibility only for the local Windows terminal", () => {
    const localView = render(<TerminalPanel blockId="block-local" sessionKey="block-local:local" local visible/>);
    const localOptions = mocks.terminals[mocks.terminals.length - 1]?.options;
    expect(localOptions?.windowsPty).toEqual({ backend: "conpty", buildNumber: 26100 });
    localView.unmount();
    act(() => vi.runAllTimers());

    const sshView = render(<TerminalPanel blockId="block-ssh" sessionKey="block-ssh:ssh-1" local={false} visible/>);
    const sshOptions = mocks.terminals[mocks.terminals.length - 1]?.options;
    expect(sshOptions?.windowsPty).toBeUndefined();
    sshView.unmount();
  });

  it("applies asynchronously loaded ConPTY metadata without replacing the xterm instance", () => {
    mocks.localTerminalCapabilities = null;
    const view = render(<TerminalPanel blockId="block-late" sessionKey="block-late:local" local visible/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];
    const terminalCount = mocks.terminals.length;
    expect(terminal.options.windowsPty).toBeUndefined();

    mocks.localTerminalCapabilities = { windowsPty: { backend: "conpty", buildNumber: 26100 } };
    view.rerender(<TerminalPanel blockId="block-late" sessionKey="block-late:local" local visible/>);

    expect(mocks.terminals).toHaveLength(terminalCount);
    expect(terminal.options.windowsPty).toEqual({ backend: "conpty", buildNumber: 26100 });
    view.unmount();
  });

  it("waits for workspace hydration before starting a local shell", () => {
    mocks.hydrated = false;
    const view = render(<TerminalPanel blockId="block-hydrated" sessionKey="block-hydrated:local" local visible/>);
    expect(mocks.startLocalBlock).not.toHaveBeenCalled();

    mocks.hydrated = true;
    view.rerender(<TerminalPanel blockId="block-hydrated" sessionKey="block-hydrated:local" local visible/>);

    expect(mocks.startLocalBlock).toHaveBeenCalledWith("block-hydrated", 80, 24);
    view.unmount();
  });

  it("forces a full redraw when a hidden terminal becomes visible", () => {
    const view = render(<TerminalPanel blockId="block-visible" sessionKey="block-visible:local" local visible={false}/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];
    expect(terminal.refresh).not.toHaveBeenCalled();

    view.rerender(<TerminalPanel blockId="block-visible" sessionKey="block-visible:local" local visible/>);
    act(() => vi.runAllTimers());

    expect(terminal.refresh).toHaveBeenCalledWith(0, 23);
    view.unmount();
  });

  it("waits for valid terminal dimensions before fitting and refreshing", () => {
    const view = render(<TerminalPanel blockId="block-measure" sessionKey="block-measure:local" local visible={false}/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];
    const fit = mocks.fits[mocks.fits.length - 1];
    fit.proposeDimensions.mockReturnValueOnce(undefined).mockReturnValue({ cols: 100, rows: 30 });

    view.rerender(<TerminalPanel blockId="block-measure" sessionKey="block-measure:local" local visible/>);
    act(() => vi.runAllTimers());

    expect(fit.proposeDimensions).toHaveBeenCalledTimes(2);
    expect(fit.fit).toHaveBeenCalledOnce();
    expect(terminal.refresh).toHaveBeenCalledWith(0, 23);
    view.unmount();
  });
});

describe("TerminalPanel clipboard interaction", () => {
  beforeEach(() => {
    mocks.terminals.length = 0;
    mocks.registerWriter.mockClear();
    mocks.writeBlock.mockClear();
    mocks.clearBlockBuffer.mockClear();
    mocks.writeClipboardText.mockClear();
    mocks.readClipboardText.mockReset().mockResolvedValue("");
    mocks.runtimes = { "block-menu": { status: "connected" }, "block-keys": { status: "connected" } };
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("replaces the native menu and enables copy only when the terminal has a selection", async () => {
    const view = render(<TerminalPanel blockId="block-menu" sessionKey="block-menu:local" local={false} visible/>);
    const terminal = mocks.terminals[0];
    const surface = screen.getByLabelText("终端 block-menu");

    fireEvent.contextMenu(surface, { clientX: 40, clientY: 50 });
    expect(screen.getByRole("menu", { name: "终端菜单" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /复制/ })).toBeDisabled();

    terminal.hasSelection.mockReturnValue(true);
    terminal.getSelection.mockReturnValue("selected output");
    fireEvent.contextMenu(surface, { clientX: 40, clientY: 50 });
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: /复制/ })); });

    expect(mocks.writeClipboardText).toHaveBeenCalledWith("selected output");
    expect(screen.queryByRole("menu", { name: "终端菜单" })).not.toBeInTheDocument();
    view.unmount();
  });

  it("pastes single-line clipboard text directly and confirms multi-line text without exposing it", async () => {
    mocks.readClipboardText.mockResolvedValueOnce("echo safe").mockResolvedValueOnce("secret one\nsecret two");
    const view = render(<TerminalPanel blockId="block-menu" sessionKey="block-menu:local" local={false} visible/>);
    const terminal = mocks.terminals[0];
    const surface = screen.getByLabelText("终端 block-menu");

    fireEvent.contextMenu(surface, { clientX: 40, clientY: 50 });
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: /粘贴/ })); });
    expect(terminal.paste).toHaveBeenCalledWith("echo safe");

    fireEvent.contextMenu(surface, { clientX: 40, clientY: 50 });
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: /粘贴/ })); });
    expect(screen.getByRole("dialog", { name: "确认粘贴？" })).toHaveTextContent("2 行");
    expect(screen.queryByText("secret one")).not.toBeInTheDocument();
    expect(terminal.paste).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "粘贴到终端" }));
    expect(terminal.paste).toHaveBeenLastCalledWith("secret one\nsecret two");
    view.unmount();
  });

  it("runs select-all and the existing buffer-clear action on the triggering terminal", () => {
    const view = render(<TerminalPanel blockId="block-menu" sessionKey="block-menu:local" local={false} visible/>);
    const terminal = mocks.terminals[0];
    const surface = screen.getByLabelText("终端 block-menu");

    fireEvent.keyDown(surface, { key: "ContextMenu" });
    fireEvent.click(screen.getByRole("menuitem", { name: "全选" }));
    expect(terminal.selectAll).toHaveBeenCalledOnce();

    fireEvent.contextMenu(surface, { clientX: 40, clientY: 50 });
    fireEvent.click(screen.getByRole("menuitem", { name: "清除终端缓冲区" }));
    expect(mocks.clearBlockBuffer).toHaveBeenCalledWith("block-menu");
    view.unmount();
  });

  it("supports Shift+F10 menu navigation and restores terminal focus on Escape", () => {
    const view = render(<TerminalPanel blockId="block-menu" sessionKey="block-menu:local" local={false} visible/>);
    const terminal = mocks.terminals[0];
    const surface = screen.getByLabelText("终端 block-menu");

    fireEvent.keyDown(surface, { key: "F10", shiftKey: true });
    act(() => vi.runOnlyPendingTimers());
    const menu = screen.getByRole("menu", { name: "终端菜单" });
    expect(screen.getByRole("menuitem", { name: /粘贴/ })).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "全选" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => vi.runOnlyPendingTimers());

    expect(screen.queryByRole("menu", { name: "终端菜单" })).not.toBeInTheDocument();
    expect(terminal.focus).toHaveBeenCalled();
    view.unmount();
  });

  it("uses Windows desktop clipboard shortcuts without swallowing Ctrl+C when there is no selection", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.readClipboardText.mockResolvedValue("from outside");
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local" local={false} visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))).toBe(true);
    expect(mocks.writeClipboardText).not.toHaveBeenCalled();

    terminal.hasSelection.mockReturnValue(true);
    terminal.getSelection.mockReturnValue("inside terminal");
    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))).toBe(false);
    await act(async () => undefined);
    expect(mocks.writeClipboardText).toHaveBeenCalledWith("inside terminal");

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => undefined);
    expect(terminal.paste).toHaveBeenCalledWith("from outside");
    view.unmount();
  });

  it("preserves plain Ctrl+V for Linux terminal programs while supporting Ctrl+Shift+V", async () => {
    vi.stubGlobal("navigator", { platform: "Linux x86_64", userAgent: "Linux" });
    mocks.readClipboardText.mockResolvedValue("clipboard");
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local" local={false} visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(true);
    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, shiftKey: true }))).toBe(false);
    await act(async () => undefined);
    expect(terminal.paste).toHaveBeenCalledWith("clipboard");
    view.unmount();
  });

  it("maps macOS Ctrl or Option with Left and Right to shell word navigation", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Macintosh" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local" local={false} visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: true }))).toBe(false);
    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true }))).toBe(false);
    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true }))).toBe(false);
    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }))).toBe(false);

    expect(mocks.writeBlock).toHaveBeenCalledTimes(4);
    expect(Array.from(mocks.writeBlock.mock.calls[0]?.[1] ?? [])).toEqual([27, 98]);
    expect(Array.from(mocks.writeBlock.mock.calls[1]?.[1] ?? [])).toEqual([27, 102]);
    expect(Array.from(mocks.writeBlock.mock.calls[2]?.[1] ?? [])).toEqual([27, 98]);
    expect(Array.from(mocks.writeBlock.mock.calls[3]?.[1] ?? [])).toEqual([27, 102]);
    view.unmount();
  });

  it("leaves other arrow key combinations and platforms to xterm", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Macintosh" });
    const macView = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local" local={false} visible/>);
    const macTerminal = mocks.terminals[0];

    expect(macTerminal.keyHandler?.(new KeyboardEvent("keyup", { key: "ArrowLeft", ctrlKey: true }))).toBe(true);
    expect(macTerminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowLeft" }))).toBe(true);
    expect(macTerminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(macTerminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, altKey: true }))).toBe(true);
    expect(macTerminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, metaKey: true }))).toBe(true);
    expect(mocks.writeBlock).not.toHaveBeenCalled();
    macView.unmount();
    act(() => vi.runAllTimers());

    vi.stubGlobal("navigator", { platform: "Linux x86_64", userAgent: "Linux" });
    const linuxView = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:linux" local={false} visible/>);
    const linuxTerminal = mocks.terminals[mocks.terminals.length - 1];
    expect(linuxTerminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: true }))).toBe(true);
    expect(mocks.writeBlock).not.toHaveBeenCalled();
    linuxView.unmount();
  });
});

describe("OSC 7 working directory parsing", () => {
  it("accepts POSIX and Windows file URIs and rejects other protocols", () => {
    expect(parseOsc7Cwd("file://server/home/deploy/project")).toBe("/home/deploy/project");
    expect(parseOsc7Cwd("file://localhost/C:/Users/Test/project")).toBe("C:/Users/Test/project");
    expect(parseOsc7Cwd("https://example.com/tmp")).toBeNull();
    expect(parseOsc7Cwd("not a uri")).toBeNull();
  });
});
