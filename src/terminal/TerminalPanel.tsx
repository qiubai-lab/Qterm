import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { readText as readClipboardText, writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import "@xterm/xterm/css/xterm.css";

import { DialogFrame } from "../components/dialogs/DialogFrame";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import { parseOsc7Cwd } from "./osc7";
import { createResizeScheduler, type ResizeScheduler } from "./resizeScheduler";

interface TerminalView {
  terminal: Terminal;
  fit: FitAddon;
  decoder: TextDecoder;
  element: HTMLElement;
  input: { dispose: () => void };
  cwdHandler: { dispose: () => void };
  onCwd: (cwd: string) => void;
  onKey: (event: KeyboardEvent) => boolean;
  write: (data: string) => void;
  resize: { send: (columns: number, rows: number) => Promise<void> };
  resizeScheduler: ResizeScheduler;
  disposeTimer: number | null;
}

type ClipboardPlatform = "mac" | "windows" | "linux";
type ContextMenuState = { anchorX: number; anchorY: number; x: number; y: number; placement: "above" | "below"; hasSelection: boolean };
type PendingPaste = { text: string; lines: number; characters: number };

const terminalViews = new Map<string, TerminalView>();
const CLEAR_SCREEN_INPUT = "\x1bcls\r";
const FALLBACK_TERMINAL_FONT_FAMILY = "SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const FALLBACK_TERMINAL_FONT_SIZE = 13;
const FALLBACK_TERMINAL_LINE_HEIGHT = 1.22;
const LONG_PASTE_THRESHOLD = 1000;

function terminalTheme() {
  return {
    background: "#00000000",
    foreground: "#f1f3f5",
    cursor: "#74e6d1",
    selectionBackground: "#2a5550",
    black: "#15171a",
    brightBlack: "#707780",
    green: "#74e6a5",
    brightGreen: "#9bf5bd",
    red: "#ff7770",
    brightRed: "#ff9b96",
    overviewRulerBorder: "#00000000",
    scrollbarSliderBackground: "#75e6cf80",
    scrollbarSliderHoverBackground: "#75e6cfa6",
    scrollbarSliderActiveBackground: "#75e6cfbf",
  };
}

export function TerminalPanel({ blockId, sessionKey, visible, local }: { blockId: string; sessionKey: string; visible: boolean; local: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<TerminalView | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingPaste, setPendingPaste] = useState<PendingPaste | null>(null);
  const { hydrated = true, localTerminalCapabilities, registerWriter, setBlockCwd, startLocalBlock, writeBlock, resizeBlock, clearBlockBuffer, runtimes } = useWorkspace();
  const windowsPty = local ? localTerminalCapabilities?.windowsPty ?? undefined : undefined;
  const inputEnabled = runtimes[blockId]?.status === "connected";
  const clipboardPlatform = terminalClipboardPlatform();
  const writeRef = useRef(writeBlock);
  const resizeRef = useRef(resizeBlock);
  const startLocalRef = useRef(startLocalBlock);
  useEffect(() => { writeRef.current = writeBlock; }, [writeBlock]);
  useEffect(() => { resizeRef.current = resizeBlock; }, [resizeBlock]);
  useEffect(() => { startLocalRef.current = startLocalBlock; }, [startLocalBlock]);

  const restoreTerminalFocus = useCallback(() => {
    window.requestAnimationFrame(() => viewRef.current?.terminal.focus());
  }, []);

  const closeContextMenu = useCallback((restoreFocus = true) => {
    setContextMenu(null);
    if (restoreFocus) restoreTerminalFocus();
  }, [restoreTerminalFocus]);

  const copySelection = useCallback(async () => {
    const terminal = viewRef.current?.terminal;
    if (!terminal?.hasSelection()) return;
    try { await writeClipboardText(terminal.getSelection()); }
    catch { /* Keep clipboard failures from reaching the terminal input path. */ }
    closeContextMenu();
  }, [closeContextMenu]);

  const requestPaste = useCallback(async () => {
    if (!inputEnabled) return;
    let text: string;
    try { text = await readClipboardText(); }
    catch { closeContextMenu(); return; }
    closeContextMenu(false);
    if (!text) { restoreTerminalFocus(); return; }
    if (isGuardedPaste(text)) {
      setPendingPaste({ text, lines: pasteLineCount(text), characters: text.length });
      return;
    }
    viewRef.current?.terminal.paste(text);
    restoreTerminalFocus();
  }, [closeContextMenu, inputEnabled, restoreTerminalFocus]);

  const selectAll = useCallback(() => {
    viewRef.current?.terminal.selectAll();
    closeContextMenu();
  }, [closeContextMenu]);

  const clearBuffer = useCallback(() => {
    clearBlockBuffer(blockId);
    closeContextMenu();
  }, [blockId, clearBlockBuffer, closeContextMenu]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const view = acquireTerminalView(sessionKey, container, windowsPty, local ? 50 : 0);
    view.write = (data) => { void writeRef.current(blockId, new TextEncoder().encode(data)); };
    view.resize.send = (columns, rows) => resizeRef.current(blockId, columns, rows);
    view.onCwd = (cwd) => setBlockCwd(blockId, cwd);
    viewRef.current = view;
    const unregisterWriter = registerWriter(
      blockId,
      (data) => view.terminal.write(view.decoder.decode(data, { stream: true })),
      (reset) => {
        if (reset) {
          view.decoder = new TextDecoder();
          view.terminal.reset();
        } else if (local && windowsPty?.backend === "conpty") {
          view.write(CLEAR_SCREEN_INPUT);
        } else {
          view.terminal.clear();
        }
      },
    );
    const observer = new ResizeObserver(() => {
      if (!container.offsetParent) return;
      if (!restoreTerminalLayout(view)) return;
      view.resizeScheduler.request(view.terminal.cols, view.terminal.rows);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      unregisterWriter();
      view.write = () => undefined;
      view.resize.send = async () => undefined;
      view.onCwd = () => undefined;
      view.onKey = () => true;
      scheduleTerminalViewDisposal(sessionKey, view);
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [blockId, local, registerWriter, sessionKey, setBlockCwd, windowsPty]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.onKey = (event) => handleClipboardShortcut(event, clipboardPlatform, view.terminal, inputEnabled, copySelection, requestPaste);
    return () => { view.onKey = () => true; };
  }, [clipboardPlatform, copySelection, inputEnabled, requestPaste]);

  useEffect(() => {
    if (!hydrated || !local) return;
    const view = viewRef.current;
    if (view) void startLocalRef.current(blockId, view.terminal.cols, view.terminal.rows);
  }, [blockId, hydrated, local]);

  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let cancelled = false;
    let attempts = 0;
    const restore = () => {
      if (cancelled) return;
      const view = viewRef.current;
      if (!view || !restoreTerminalLayout(view)) {
        attempts += 1;
        if (attempts < 12) frame = requestAnimationFrame(restore);
        return;
      }
      view.resizeScheduler.request(view.terminal.cols, view.terminal.rows);
    };
    frame = requestAnimationFrame(restore);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [blockId, local, visible]);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".terminal-context-menu")) closeContextMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContextMenu();
    };
    const closeWithoutFocus = () => closeContextMenu(false);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeWithoutFocus);
    window.addEventListener("scroll", closeWithoutFocus, true);
    window.setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeWithoutFocus);
      window.removeEventListener("scroll", closeWithoutFocus, true);
    };
  }, [closeContextMenu, contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const fitted = fitContextMenu(contextMenu.anchorX, contextMenu.anchorY, menuRef.current.offsetWidth, menuRef.current.offsetHeight, window.innerWidth, window.innerHeight);
    if (fitted.x !== contextMenu.x || fitted.y !== contextMenu.y || fitted.placement !== contextMenu.placement) {
      setContextMenu((current) => current ? { ...current, ...fitted } : null);
    }
  }, [contextMenu]);

  function openContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const hasSelection = viewRef.current?.terminal.hasSelection() ?? false;
    setContextMenu({ anchorX: event.clientX, anchorY: event.clientY, x: event.clientX, y: event.clientY, placement: "below", hasSelection });
  }

  function openKeyboardContextMenu(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorX = rect.left + 14;
    const anchorY = rect.top + 18;
    setContextMenu({ anchorX, anchorY, x: anchorX, y: anchorY, placement: "below", hasSelection: viewRef.current?.terminal.hasSelection() ?? false });
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)"));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      items[(index + offset + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      closeContextMenu();
    }
  }

  function confirmPaste() {
    if (!pendingPaste || !inputEnabled) return;
    viewRef.current?.terminal.paste(pendingPaste.text);
    setPendingPaste(null);
    restoreTerminalFocus();
  }

  return <>
    <div className="terminal-surface" ref={containerRef} aria-label={`终端 ${blockId}`} onContextMenu={openContextMenu} onKeyDown={openKeyboardContextMenu}/>
    {contextMenu && createPortal(<div
      ref={menuRef}
      className="terminal-context-menu"
      data-placement={contextMenu.placement}
      role="menu"
      aria-label="终端菜单"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleMenuKeyDown}
    >
      <button role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void copySelection()}><span>复制</span><kbd>{copyShortcutLabel(clipboardPlatform)}</kbd></button>
      <button role="menuitem" disabled={!inputEnabled} onClick={() => void requestPaste()}><span>粘贴</span><kbd>{pasteShortcutLabel(clipboardPlatform)}</kbd></button>
      <div className="terminal-context-menu-separator" role="separator"/>
      <button role="menuitem" onClick={selectAll}><span>全选</span></button>
      <div className="terminal-context-menu-separator" role="separator"/>
      <button role="menuitem" onClick={clearBuffer}><span>清除终端缓冲区</span></button>
    </div>, document.body)}
    {pendingPaste && createPortal(<DialogFrame compact title="确认粘贴？" subtitle="多行或较长内容可能立即执行命令" onClose={() => { setPendingPaste(null); restoreTerminalFocus(); }}>
      <p className="confirm-copy">剪贴板包含 {pendingPaste.lines} 行、{pendingPaste.characters} 个字符。确认只会把内容发送到当前终端，不会在此处显示剪贴板正文。</p>
      <footer className="dialog-actions end"><button className="secondary-button" onClick={() => { setPendingPaste(null); restoreTerminalFocus(); }}>取消</button><button data-dialog-autofocus className="primary-button" disabled={!inputEnabled} onClick={confirmPaste}>粘贴到终端</button></footer>
    </DialogFrame>, document.body)}
  </>;
}

function terminalClipboardPlatform(): ClipboardPlatform {
  const navigatorWithData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const value = `${navigatorWithData.userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  if (value.includes("mac")) return "mac";
  if (value.includes("win")) return "windows";
  return "linux";
}

function handleClipboardShortcut(event: KeyboardEvent, platform: ClipboardPlatform, terminal: Terminal, inputEnabled: boolean, copy: () => Promise<void>, paste: () => Promise<void>): boolean {
  if (event.type !== "keydown" || event.altKey) return true;
  const key = event.key.toLowerCase();
  const macShortcut = platform === "mac" && event.metaKey && !event.ctrlKey;
  const terminalShortcut = platform !== "mac" && event.ctrlKey && event.shiftKey && !event.metaKey;
  const windowsDesktopShortcut = platform === "windows" && event.ctrlKey && !event.shiftKey && !event.metaKey;
  if (key === "c" && (macShortcut || terminalShortcut || (windowsDesktopShortcut && terminal.hasSelection()))) {
    event.preventDefault();
    event.stopPropagation();
    void copy();
    return false;
  }
  if (key === "v" && inputEnabled && (macShortcut || terminalShortcut || windowsDesktopShortcut)) {
    event.preventDefault();
    event.stopPropagation();
    void paste();
    return false;
  }
  return true;
}

function copyShortcutLabel(platform: ClipboardPlatform): string {
  return platform === "mac" ? "⌘C" : platform === "windows" ? "Ctrl+C" : "Ctrl+Shift+C";
}

function pasteShortcutLabel(platform: ClipboardPlatform): string {
  return platform === "mac" ? "⌘V" : platform === "windows" ? "Ctrl+V" : "Ctrl+Shift+V";
}

function isGuardedPaste(text: string): boolean {
  return text.length > LONG_PASTE_THRESHOLD || /[\r\n]/.test(text);
}

function pasteLineCount(text: string): number {
  return text.split(/\r\n|\r|\n/).length;
}

function fitContextMenu(anchorX: number, anchorY: number, menuWidth: number, menuHeight: number, viewportWidth: number, viewportHeight: number) {
  const inset = 6;
  const gap = 6;
  const placement = anchorY + menuHeight + gap > viewportHeight ? "above" : "below";
  const preferredTop = placement === "above" ? anchorY - menuHeight - gap : anchorY + gap;
  return {
    x: Math.max(inset, Math.min(anchorX, viewportWidth - menuWidth - inset)),
    y: Math.max(inset, Math.min(preferredTop, viewportHeight - menuHeight - inset)),
    placement,
  } as const;
}

function restoreTerminalLayout(view: TerminalView): boolean {
  const dimensions = view.fit.proposeDimensions();
  if (!dimensions || !Number.isFinite(dimensions.cols) || !Number.isFinite(dimensions.rows) || dimensions.cols < 2 || dimensions.rows < 1) return false;
  view.fit.fit();
  view.terminal.refresh(0, Math.max(0, view.terminal.rows - 1));
  return true;
}

function acquireTerminalView(sessionKey: string, container: HTMLElement, windowsPty: { backend: "conpty"; buildNumber: number } | undefined, resizeDelayMs: number): TerminalView {
  const existing = terminalViews.get(sessionKey);
  if (existing) {
    if (existing.disposeTimer !== null) window.clearTimeout(existing.disposeTimer);
    existing.disposeTimer = null;
    if (windowsPty) existing.terminal.options.windowsPty = windowsPty;
    existing.terminal.options.theme = terminalTheme();
    container.append(existing.element);
    return existing;
  }

  const typography = terminalTypography();
  const terminal = new Terminal({
    cursorBlink: true,
    ...typography,
    scrollback: 8000,
    ...(windowsPty ? { windowsPty } : {}),
    allowTransparency: true,
    overviewRuler: { width: 3 },
    theme: terminalTheme(),
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(container);
  const element = terminal.element;
  if (!element) {
    terminal.dispose();
    throw new Error("xterm did not create a terminal element");
  }
  const resize: TerminalView["resize"] = { send: async () => undefined };
  const resizeScheduler = createResizeScheduler((columns, rows) => resize.send(columns, rows), resizeDelayMs);
  const view: TerminalView = {
    terminal,
    fit,
    decoder: new TextDecoder(),
    element,
    input: { dispose: () => undefined },
    cwdHandler: { dispose: () => undefined },
    onCwd: () => undefined,
    onKey: () => true,
    write: () => undefined,
    resize,
    resizeScheduler,
    disposeTimer: null,
  };
  terminal.attachCustomKeyEventHandler((event) => view.onKey(event));
  view.input = terminal.onData((data) => view.write(data));
  view.cwdHandler = terminal.parser.registerOscHandler(7, (data) => {
    const cwd = parseOsc7Cwd(data);
    if (cwd) view.onCwd(cwd);
    return true;
  });
  terminalViews.set(sessionKey, view);
  return view;
}

function terminalTypography(): { fontFamily: string; fontSize: number; lineHeight: number } {
  const style = getComputedStyle(document.documentElement);
  const number = (property: string, fallback: number) => {
    const value = Number.parseFloat(style.getPropertyValue(property));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    fontFamily: style.getPropertyValue("--terminal-font-family").trim() || FALLBACK_TERMINAL_FONT_FAMILY,
    fontSize: number("--terminal-font-size", FALLBACK_TERMINAL_FONT_SIZE),
    lineHeight: number("--terminal-line-height", FALLBACK_TERMINAL_LINE_HEIGHT),
  };
}

function scheduleTerminalViewDisposal(sessionKey: string, view: TerminalView) {
  view.disposeTimer = window.setTimeout(() => {
    if (terminalViews.get(sessionKey) !== view || view.disposeTimer === null) return;
    view.input.dispose();
    view.cwdHandler.dispose();
    view.resizeScheduler.dispose();
    view.terminal.dispose();
    terminalViews.delete(sessionKey);
    view.disposeTimer = null;
  }, 0);
}
