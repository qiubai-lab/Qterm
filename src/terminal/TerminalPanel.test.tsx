import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  terminals: [] as Array<{
    cols: number;
    rows: number;
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
    loadAddon: ReturnType<typeof vi.fn>;
    keyHandler: ((event: KeyboardEvent) => boolean) | null;
    dataHandler: ((data: string) => void) | null;
    osc7Handler: ((data: string) => boolean) | null;
  }>,
  fits: [] as Array<{ fit: ReturnType<typeof vi.fn>; proposeDimensions: ReturnType<typeof vi.fn> }>,
  searches: [] as Array<{
    findNext: ReturnType<typeof vi.fn>;
    findPrevious: ReturnType<typeof vi.fn>;
    clearDecorations: ReturnType<typeof vi.fn>;
    resultHandler: ((result: { resultIndex: number; resultCount: number }) => void) | null;
  }>,
  registerWriter: vi.fn<(blockId: string, writer: (data: Uint8Array) => void, clearer: (reset: boolean) => void, readSize: () => { columns: number; rows: number }) => () => void>(() => vi.fn()),
  setBlockCwd: vi.fn(),
  startLocalBlock: vi.fn(),
  hydrated: true,
  localTerminalCapabilities: { windowsPty: { backend: "conpty" as const, buildNumber: 26100 } } as { windowsPty: { backend: "conpty"; buildNumber: number } | null } | null,
  writeBlock: vi.fn().mockResolvedValue(undefined),
  resizeBlock: vi.fn().mockResolvedValue(undefined),
  clearBlockBuffer: vi.fn(),
  writeClipboardText: vi.fn().mockResolvedValue(undefined),
  readClipboardText: vi.fn().mockResolvedValue(""),
  startTerminalClipboardStaging: vi.fn(),
  cancelTerminalClipboardStaging: vi.fn().mockResolvedValue(undefined),
  runtimes: {} as Record<string, { status: string; sessionId?: string | null }>,
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: mocks.readClipboardText,
  writeText: mocks.writeClipboardText,
}));

vi.mock("../lib/tauri/sessions", () => ({
  startTerminalClipboardStaging: mocks.startTerminalClipboardStaging,
  cancelTerminalClipboardStaging: mocks.cancelTerminalClipboardStaging,
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

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: class {
    findNext = vi.fn(() => true);
    findPrevious = vi.fn(() => true);
    clearDecorations = vi.fn();
    resultHandler: ((result: { resultIndex: number; resultCount: number }) => void) | null = null;

    constructor() { mocks.searches.push(this); }
    onDidChangeResults = (handler: (result: { resultIndex: number; resultCount: number }) => void) => {
      this.resultHandler = handler;
      return { dispose: vi.fn() };
    };
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
    dataHandler: ((data: string) => void) | null = null;
    paste = vi.fn((data: string) => this.dataHandler?.(data));
    focus = vi.fn();
    selectAll = vi.fn();
    hasSelection = vi.fn(() => false);
    getSelection = vi.fn(() => "");
    keyHandler: ((event: KeyboardEvent) => boolean) | null = null;
    osc7Handler: ((data: string) => boolean) | null = null;
    parser = { registerOscHandler: vi.fn((identifier: number, handler: (data: string) => boolean) => {
      if (identifier === 7) this.osc7Handler = handler;
      return { dispose: vi.fn() };
    }) };

    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mocks.terminals.push(this);
    }

    loadAddon = vi.fn();

    open(container: HTMLElement) {
      this.element = document.createElement("div");
      this.element.dataset.xtermView = "preserved";
      container.append(this.element);
    }

    onData(handler: (data: string) => void) {
      this.dataHandler = handler;
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
    resizeBlock: mocks.resizeBlock,
  }),
}));

import { TerminalPanel } from "./TerminalPanel";
import { parseOsc7Cwd } from "./osc7";
import { ensureTerminalSearch } from "./terminalSearch";

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
    mocks.searches.length = 0;
    mocks.registerWriter.mockClear();
    mocks.setBlockCwd.mockClear();
    mocks.startLocalBlock.mockClear();
    mocks.writeBlock.mockClear();
    mocks.resizeBlock.mockClear();
    mocks.clearBlockBuffer.mockClear();
    mocks.writeClipboardText.mockClear();
    mocks.readClipboardText.mockReset().mockResolvedValue("");
    mocks.startTerminalClipboardStaging.mockReset().mockResolvedValue({ kind: "empty" });
    mocks.cancelTerminalClipboardStaging.mockReset().mockResolvedValue(undefined);
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
      allowProposedApi: boolean;
      allowTransparency: boolean;
      overviewRuler: { width: number };
      theme: Record<string, string>;
    };

    expect(options.fontFamily).toBe("SFMono-Regular, Menlo, Monaco, Consolas, monospace");
    expect(options.fontSize).toBe(13);
    expect(options.lineHeight).toBe(1.22);
    expect(options.allowProposedApi).toBe(true);
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

  it("asks a local ConPTY shell to clear so its cursor stays synchronized with xterm", async () => {
    const view = render(<TerminalPanel blockId="block-clear-local" sessionKey="block-clear-local:local" local visible/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];
    const clear = mocks.registerWriter.mock.calls[mocks.registerWriter.mock.calls.length - 1]?.[2];

    clear?.(false);
    await act(async () => undefined);

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

    expect(mocks.startLocalBlock).toHaveBeenCalledWith("block-hydrated", 80, 24, true);
    view.unmount();
  });

  it("waits for terminal settings before starting a local shell", () => {
    const view = render(<TerminalPanel blockId="block-settings" sessionKey="block-settings:local" local visible osc7Enabled={false} terminalSettingsReady={false}/>);
    expect(mocks.startLocalBlock).not.toHaveBeenCalled();

    view.rerender(<TerminalPanel blockId="block-settings" sessionKey="block-settings:local" local visible osc7Enabled={false} terminalSettingsReady/>);

    expect(mocks.startLocalBlock).toHaveBeenCalledWith("block-settings", 80, 24, false);
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

  it("restores search capability on a terminal view created before the addon existed", () => {
    const view = render(<TerminalPanel blockId="block-legacy-search" sessionKey="block-legacy-search:local" local={false} visible/>);
    const terminal = mocks.terminals[0];
    const onSearchResults = vi.fn();
    const legacyView = { terminal, onSearchResults } as unknown as Parameters<typeof ensureTerminalSearch>[0];
    const initialAddonCount = mocks.searches.length;

    const search = ensureTerminalSearch(legacyView);
    const recoveredSearch = mocks.searches[mocks.searches.length - 1];

    expect(mocks.searches).toHaveLength(initialAddonCount + 1);
    expect(terminal.loadAddon).toHaveBeenCalledWith(recoveredSearch);
    act(() => recoveredSearch.resultHandler?.({ resultIndex: 0, resultCount: 3 }));
    expect(onSearchResults).toHaveBeenCalledWith({ resultIndex: 0, resultCount: 3 });
    expect(ensureTerminalSearch(legacyView)).toBe(search);
    expect(mocks.searches).toHaveLength(initialAddonCount + 1);
    view.unmount();
  });

  it("registers a live terminal size reader that refits before an SSH connection", () => {
    const view = render(<TerminalPanel blockId="block-size-reader" sessionKey="block-size-reader:ssh" local={false} visible/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];
    const fit = mocks.fits[mocks.fits.length - 1];
    const readSize = mocks.registerWriter.mock.calls[mocks.registerWriter.mock.calls.length - 1]?.[3];
    terminal.cols = 93;
    terminal.rows = 31;
    const fitsBeforeRead = fit.fit.mock.calls.length;

    expect(readSize?.()).toEqual({ columns: 93, rows: 31 });
    expect(fit.fit.mock.calls.length).toBeGreaterThan(fitsBeforeRead);
    view.unmount();
  });

  it("force-synchronizes the current dimensions when an SSH session id becomes available", async () => {
    mocks.runtimes = { "block-ssh-size": { status: "connecting", sessionId: null } };
    const view = render(<TerminalPanel blockId="block-ssh-size" sessionKey="block-ssh-size:ssh" local={false} visible/>);
    await act(async () => vi.runAllTimersAsync());
    mocks.resizeBlock.mockClear();

    mocks.runtimes = { "block-ssh-size": { status: "connected", sessionId: "ssh-1" } };
    view.rerender(<TerminalPanel blockId="block-ssh-size" sessionKey="block-ssh-size:ssh" local={false} visible/>);
    await act(async () => vi.runAllTimersAsync());

    expect(mocks.resizeBlock).toHaveBeenCalledWith("block-ssh-size", 80, 24);
    view.unmount();
  });
});

describe("TerminalPanel clipboard interaction", () => {
  beforeEach(() => {
    mocks.terminals.length = 0;
    mocks.registerWriter.mockClear();
    mocks.writeBlock.mockClear();
    mocks.resizeBlock.mockClear();
    mocks.clearBlockBuffer.mockClear();
    mocks.writeClipboardText.mockClear();
    mocks.readClipboardText.mockReset().mockResolvedValue("");
    mocks.startTerminalClipboardStaging.mockReset().mockResolvedValue({ kind: "empty" });
    mocks.cancelTerminalClipboardStaging.mockReset().mockResolvedValue(undefined);
    mocks.runtimes = { "block-menu": { status: "connected", sessionId: "ssh-menu" }, "block-keys": { status: "connected", sessionId: "ssh-keys" } };
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
    mocks.startTerminalClipboardStaging
      .mockResolvedValueOnce({ kind: "text", text: "echo safe" })
      .mockResolvedValueOnce({ kind: "text", text: "secret one\nsecret two" });
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

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "粘贴到终端" }));
      await Promise.resolve();
      await Promise.resolve();
    });
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
    expect(screen.getByRole("menuitem", { name: /搜索/ })).toHaveFocus();
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
    mocks.startTerminalClipboardStaging.mockResolvedValue({ kind: "text", text: "from outside" });
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

  it("keeps a control key pressed during clipboard IPC behind the pasted text", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    let resolveClipboard: ((value: { kind: "text"; text: string }) => void) | null = null;
    mocks.startTerminalClipboardStaging.mockReturnValue(new Promise((resolve) => { resolveClipboard = resolve; }));
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:paste-order" local={false} visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    terminal.dataHandler?.("\x03");
    expect(mocks.writeBlock).not.toHaveBeenCalled();

    await act(async () => {
      resolveClipboard?.({ kind: "text", text: "/data/models/Qwen" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(terminal.paste).toHaveBeenCalledWith("/data/models/Qwen");
    expect(mocks.writeBlock.mock.calls.map(([, data]) => new TextDecoder().decode(data))).toEqual(["/data/models/Qwen", "\x03"]);
    view.unmount();
  });

  it("uploads clipboard files with progress and pastes every remote path before later input", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "ssh-1" } };
    mocks.startTerminalClipboardStaging.mockResolvedValue({ kind: "transfer", taskId: "task-1" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:image-paste" local={false} visible/>);
    const terminal = mocks.terminals[0];
    expect(screen.queryByRole("status", { name: "终端文件上传状态" })).not.toBeInTheDocument();

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => Promise.resolve());
    expect(mocks.startTerminalClipboardStaging).toHaveBeenCalledWith("ssh-1", expect.any(Function));
    const onEvent = mocks.startTerminalClipboardStaging.mock.calls[0]?.[1] as (event: unknown) => void;
    act(() => {
      onEvent({ type: "started", totalBytes: 1024, itemCount: 2, displayName: "2 个项目" });
      onEvent({ type: "progress", transferredBytes: 512, totalBytes: 1024 });
    });
    const stagingStatus = screen.getByRole("status", { name: "终端文件上传状态" });
    expect(stagingStatus.querySelector(".terminal-staging-status-copy")).toHaveTextContent("正在上传2 个项目");
    expect(stagingStatus.querySelector(".terminal-staging-metrics")).toHaveTextContent("512 B / 1.0 KB");
    terminal.dataHandler?.("x");
    expect(mocks.writeBlock).not.toHaveBeenCalled();

    await act(async () => {
      onEvent({ type: "completed", remotePaths: ["/tmp/.qterm-clipboard-ssh/one.png", "/tmp/.qterm-clipboard-ssh/two.txt"] });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const pasted = "/tmp/.qterm-clipboard-ssh/one.png /tmp/.qterm-clipboard-ssh/two.txt";
    expect(terminal.paste).toHaveBeenCalledWith(pasted);
    expect(mocks.writeBlock.mock.calls.map(([, data]) => new TextDecoder().decode(data))).toEqual([
      pasted,
      "x",
    ]);
    expect(screen.getByRole("status", { name: "终端文件上传状态" })).toHaveTextContent("路径已粘贴");
    act(() => vi.advanceTimersByTime(2_500));
    expect(screen.queryByRole("status", { name: "终端文件上传状态" })).not.toBeInTheDocument();
    view.unmount();
  });

  it("stops the active staging task and keeps the cancelled state visible", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "ssh-1" } };
    mocks.startTerminalClipboardStaging.mockResolvedValue({ kind: "transfer", taskId: "task-stop" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:cancel" local={false} visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => Promise.resolve());
    const onEvent = mocks.startTerminalClipboardStaging.mock.calls[0]?.[1] as (event: unknown) => void;
    act(() => onEvent({ type: "started", totalBytes: 4096, itemCount: 1, displayName: "archive.zip" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "停止上传" })); });
    expect(mocks.cancelTerminalClipboardStaging).toHaveBeenCalledWith("ssh-1", "task-stop");
    expect(screen.getByRole("status", { name: "终端文件上传状态" })).toHaveTextContent("正在停止");

    act(() => onEvent({ type: "cancelled" }));
    await act(async () => Promise.resolve());
    expect(screen.getByRole("status", { name: "终端文件上传状态" })).toHaveTextContent("上传已停止");
    expect(terminal.paste).not.toHaveBeenCalled();
    view.unmount();
  });

  it("uses the native clipboard precedence result for remote text", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "ssh-1" } };
    mocks.startTerminalClipboardStaging.mockResolvedValue({ kind: "text", text: "prompt text" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:text-first" local={false} visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => undefined);

    expect(terminal.paste).toHaveBeenCalledWith("prompt text");
    expect(mocks.readClipboardText).not.toHaveBeenCalled();
    view.unmount();
  });

  it("does not request remote image upload for a local terminal", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "local-1" } };
    mocks.readClipboardText.mockResolvedValue("");
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local-image" local visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => undefined);

    expect(mocks.startTerminalClipboardStaging).not.toHaveBeenCalled();
    expect(terminal.paste).not.toHaveBeenCalled();
    view.unmount();
  });

  it("reports staging failure without sending terminal input", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "ssh-1" } };
    mocks.startTerminalClipboardStaging.mockRejectedValue({ message: "远程服务器未提供可用的 SFTP 子系统" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:image-error" local={false} visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => undefined);

    expect(screen.getByRole("status", { name: "终端文件上传状态" })).toHaveTextContent("上传失败远程服务器未提供可用的 SFTP 子系统");
    expect(terminal.paste).not.toHaveBeenCalled();
    expect(mocks.writeBlock).not.toHaveBeenCalled();
    view.unmount();
  });

  it("drops late remote paths after the terminal session changes", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "ssh-1" } };
    mocks.startTerminalClipboardStaging.mockResolvedValue({ kind: "transfer", taskId: "task-old" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:ssh-1" local={false} visible/>);
    const previousTerminal = mocks.terminals[0];

    expect(previousTerminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => Promise.resolve());
    const onEvent = mocks.startTerminalClipboardStaging.mock.calls[0]?.[1] as (event: unknown) => void;
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "ssh-2" } };
    view.rerender(<TerminalPanel blockId="block-keys" sessionKey="block-keys:ssh-2" local={false} visible/>);

    await act(async () => {
      onEvent({ type: "completed", remotePaths: ["/tmp/.qterm-clipboard-old/image.png"] });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(previousTerminal.paste).not.toHaveBeenCalled();
    expect(screen.queryByRole("status", { name: "终端文件上传状态" })).not.toBeInTheDocument();
    view.unmount();
  });

  it("preserves plain Ctrl+V for Linux terminal programs while supporting Ctrl+Shift+V", async () => {
    vi.stubGlobal("navigator", { platform: "Linux x86_64", userAgent: "Linux" });
    mocks.startTerminalClipboardStaging.mockResolvedValue({ kind: "text", text: "clipboard" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local" local={false} visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(true);
    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, shiftKey: true }))).toBe(false);
    await act(async () => undefined);
    expect(terminal.paste).toHaveBeenCalledWith("clipboard");
    view.unmount();
  });

  it("searches terminal output in both directions and restores focus on Escape", () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    const view = render(<TerminalPanel blockId="block-search" sessionKey="block-search:local" local={false} visible/>);
    const terminal = mocks.terminals[0];
    const search = mocks.searches[mocks.searches.length - 1];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "f", ctrlKey: true }))).toBe(true);
    act(() => expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, shiftKey: true }))).toBe(false));
    const input = screen.getByRole("searchbox", { name: "搜索内容" });
    expect(input.closest(".terminal-search-field")).not.toBeNull();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "needle" } });
    expect(search.findNext).toHaveBeenCalledWith("needle", expect.objectContaining({ incremental: true, decorations: expect.any(Object) }));

    act(() => search.resultHandler?.({ resultIndex: 1, resultCount: 4 }));
    expect(screen.getByText("2/4")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(search.findPrevious).toHaveBeenCalledWith("needle", expect.objectContaining({ decorations: expect.any(Object) }));

    const searchSurface = screen.getByRole("search", { name: "搜索终端输出" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(searchSurface).toHaveAttribute("data-state", "closing");
    expect(terminal.focus).not.toHaveBeenCalled();
    fireEvent.animationEnd(searchSurface, { animationName: "terminal-search-out" });
    act(() => vi.runAllTimers());
    expect(screen.queryByRole("search", { name: "搜索终端输出" })).not.toBeInTheDocument();
    expect(search.clearDecorations).toHaveBeenCalled();
    expect(terminal.focus).toHaveBeenCalled();
    view.unmount();
  });

  it("maps macOS Ctrl or Option with Left and Right to shell word navigation", async () => {
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Macintosh" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local" local={false} visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: true }))).toBe(false);
    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true }))).toBe(false);
    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true }))).toBe(false);
    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }))).toBe(false);

    await act(async () => undefined);

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

  it("submits only valid OSC 7 paths to the workspace runtime", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const view = render(<TerminalPanel blockId="block-cwd" sessionKey="block-cwd:ssh" local={false} visible/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];

    expect(terminal.osc7Handler?.("https://example.com/tmp")).toBe(true);
    expect(mocks.setBlockCwd).not.toHaveBeenCalled();
    expect(terminal.osc7Handler?.("file://server/srv/app")).toBe(true);
    expect(mocks.setBlockCwd).toHaveBeenCalledWith("block-cwd", "/srv/app");
    view.unmount();
    vi.unstubAllGlobals();
  });

  it("does not parse or submit OSC 7 paths while the feature is disabled", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    mocks.setBlockCwd.mockClear();
    const view = render(<TerminalPanel blockId="block-cwd-disabled" sessionKey="block-cwd-disabled:ssh" local={false} visible osc7Enabled={false}/>);
    const terminal = mocks.terminals[mocks.terminals.length - 1];

    expect(terminal.osc7Handler?.("file://server/srv/app")).toBe(true);
    expect(mocks.setBlockCwd).not.toHaveBeenCalled();
    view.unmount();
    vi.unstubAllGlobals();
  });
});
