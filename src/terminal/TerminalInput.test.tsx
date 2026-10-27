import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mocks, ResizeObserverMock } from "./terminalPanelTestFixture";
import { TerminalPanel } from "./TerminalPanel";

describe("TerminalPanel clipboard interaction", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.terminals.length = 0;
    mocks.registerWriter.mockClear();
    mocks.writeBlock.mockClear();
    mocks.resizeBlock.mockClear();
    mocks.clearBlockBuffer.mockClear();
    mocks.writeClipboardText.mockClear();
    mocks.readClipboardText.mockReset().mockResolvedValue("");
    mocks.prepareLocalTerminalClipboardPaste.mockReset().mockResolvedValue({ kind: "empty" });
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

  it("rebinds native edit events across session changes and removes them on unmount", async () => {
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Macintosh" });
    mocks.startTerminalClipboardStaging.mockResolvedValue({ kind: "text", text: "new paste" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="old" local={false} visible/>);
    const old = mocks.terminals[0];
    view.rerender(<TerminalPanel blockId="block-keys" sessionKey="new" local={false} visible/>);
    const current = mocks.terminals[1];
    await act(async () => {
      fireEvent.paste(old.element!);
      expect(fireEvent.paste(current.element!)).toBe(false);
    });
    expect(mocks.startTerminalClipboardStaging).toHaveBeenCalledOnce();
    expect(current.paste).toHaveBeenCalledWith("new paste");
    expect(old.paste).not.toHaveBeenCalled();
    const select = new CustomEvent("qterm-terminal-select-all", { bubbles: true, cancelable: true });
    expect(current.element!.dispatchEvent(select)).toBe(false);
    expect(current.selectAll).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => { fireEvent.paste(current.element!); });
    expect(mocks.startTerminalClipboardStaging).toHaveBeenCalledOnce();
  });

  it("does not stage native pastes for disconnected terminals or terminal search inputs", async () => {
    mocks.runtimes = {};
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="disconnected" local={false} visible/>);
    const terminal = mocks.terminals[0];
    await act(async () => { expect(fireEvent.paste(terminal.element!)).toBe(false); });
    act(() => { terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, shiftKey: true })); });
    const input = screen.getByRole("searchbox", { name: "搜索内容" });
    expect(fireEvent.paste(input)).toBe(true);
    expect(input.dispatchEvent(new CustomEvent("qterm-terminal-select-all", { bubbles: true, cancelable: true }))).toBe(true);
    expect(mocks.startTerminalClipboardStaging).not.toHaveBeenCalled();
    expect(terminal.selectAll).not.toHaveBeenCalled();
    view.unmount();
  });

  it("preserves Linux native PRIMARY selection paste without reading the system clipboard", async () => {
    vi.stubGlobal("navigator", { platform: "Linux x86_64", userAgent: "Linux" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="linux-primary" local={false} visible/>);
    const terminal = mocks.terminals[0];
    const xtermPaste = vi.fn();
    terminal.element!.addEventListener("paste", xtermPaste);
    await act(async () => { expect(fireEvent.paste(terminal.element!)).toBe(true); });
    expect(xtermPaste).toHaveBeenCalledOnce();
    expect(mocks.startTerminalClipboardStaging).not.toHaveBeenCalled();
    view.unmount();
  });

  it("replaces the native menu and enables copy only when the terminal has a selection", async () => {
    const view = render(<TerminalPanel blockId="block-menu" sessionKey="block-menu:local" local={false} visible/>);
    const terminal = mocks.terminals[0];
    const surface = screen.getByLabelText("终端 block-menu");

    fireEvent.contextMenu(surface, { clientX: 40, clientY: 50 });
    expect(screen.getByRole("menu", { name: "终端菜单" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^复制(?:Ctrl|⌘)/ })).toBeDisabled();

    terminal.hasSelection.mockReturnValue(true);
    terminal.getSelection.mockReturnValue("selected output");
    fireEvent.contextMenu(surface, { clientX: 40, clientY: 50 });
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: /^复制(?:Ctrl|⌘)/ })); });

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

  it.each(["keyboard", "native"])("keeps a control key pressed during clipboard IPC behind the pasted text (%s)", async (entry) => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    let resolveClipboard: ((value: { kind: "text"; text: string }) => void) | null = null;
    mocks.startTerminalClipboardStaging.mockReturnValue(new Promise((resolve) => { resolveClipboard = resolve; }));
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:paste-order" local={false} visible/>);
    const terminal = mocks.terminals[0];

    if (entry === "native") expect(fireEvent.paste(terminal.element!)).toBe(false);
    else expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
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

  it.each(["keyboard", "native"])("uploads clipboard files with progress and pastes every remote path before later input (%s)", async (entry) => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "ssh-1" } };
    mocks.startTerminalClipboardStaging.mockResolvedValue({ kind: "transfer", taskId: "task-1" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:image-paste" local={false} visible/>);
    const terminal = mocks.terminals[0];
    expect(screen.queryByRole("status", { name: "终端文件上传状态" })).not.toBeInTheDocument();

    if (entry === "native") expect(fireEvent.paste(terminal.element!)).toBe(false);
    else expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => Promise.resolve());
    expect(mocks.startTerminalClipboardStaging).toHaveBeenCalledWith("ssh-1", expect.any(Function));
    expect(mocks.startTerminalClipboardStaging).toHaveBeenCalledOnce();
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

  it.each(["keyboard", "native"])("pastes native clipboard files locally without exposing upload controls (%s)", async (entry) => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "local-1" } };
    mocks.prepareLocalTerminalClipboardPaste.mockResolvedValue({
      kind: "paths",
      text: '"C:\\My Models\\model.bin"',
      displayName: "model.bin",
      itemCount: 1,
    });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local-image" local visible/>);
    const terminal = mocks.terminals[0];

    if (entry === "native") expect(fireEvent.paste(terminal.element!)).toBe(false);
    else expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.startTerminalClipboardStaging).not.toHaveBeenCalled();
    expect(mocks.prepareLocalTerminalClipboardPaste).toHaveBeenCalledOnce();
    expect(terminal.paste).toHaveBeenCalledWith('"C:\\My Models\\model.bin"');
    const status = screen.getByRole("status", { name: "终端文件粘贴状态" });
    expect(status).toHaveTextContent("路径已粘贴model.bin");
    expect(screen.queryByRole("progressbar", { name: "上传进度" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停止上传" })).not.toBeInTheDocument();
    view.unmount();
  });

  it("keeps local clipboard preparation ahead of later terminal input", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "local-1" } };
    let resolveClipboard: ((value: { kind: "paths"; text: string; displayName: string; itemCount: number }) => void) | null = null;
    mocks.prepareLocalTerminalClipboardPaste.mockReturnValue(new Promise((resolve) => { resolveClipboard = resolve; }));
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local-order" local visible/>);
    const terminal = mocks.terminals[0];

    expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    terminal.dataHandler?.("x");
    expect(mocks.writeBlock).not.toHaveBeenCalled();

    await act(async () => {
      resolveClipboard?.({ kind: "paths", text: "C:\\model.bin", displayName: "model.bin", itemCount: 1 });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.writeBlock.mock.calls.map(([, data]) => new TextDecoder().decode(data))).toEqual(["C:\\model.bin", "x"]);
    view.unmount();
  });

  it.each(["keyboard", "native"])("preserves local text confirmation and reports native clipboard failures (%s)", async (entry) => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
    mocks.runtimes = { "block-keys": { status: "connected", sessionId: "local-1" } };
    mocks.prepareLocalTerminalClipboardPaste.mockResolvedValueOnce({ kind: "text", text: "first line\nsecond line" });
    const view = render(<TerminalPanel blockId="block-keys" sessionKey="block-keys:local-text" local visible/>);
    const terminal = mocks.terminals[0];

    if (entry === "native") expect(fireEvent.paste(terminal.element!)).toBe(false);
    else expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("dialog", { name: "确认粘贴？" })).toHaveTextContent("2 行");
    expect(terminal.paste).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    mocks.prepareLocalTerminalClipboardPaste.mockRejectedValueOnce({ message: "剪贴板文件不可访问" });
    if (entry === "native") expect(fireEvent.paste(terminal.element!)).toBe(false);
    else expect(terminal.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }))).toBe(false);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("status", { name: "终端文件粘贴状态" })).toHaveTextContent("粘贴失败剪贴板文件不可访问");
    expect(screen.queryByRole("button", { name: "停止上传" })).not.toBeInTheDocument();
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

