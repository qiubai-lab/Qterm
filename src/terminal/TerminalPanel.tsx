import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { FitAddon } from "@xterm/addon-fit";
import type { ISearchOptions } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import "@xterm/xterm/css/xterm.css";

import { resolveAppShortcut, shortcutLabel } from "../app/shortcuts";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { ExactTextInput } from "../components/ExactTextInput";
import { Icon } from "../components/Icon";
import { currentDesktopPlatform } from "../lib/tauri/window";
import { prepareLocalTerminalClipboardPaste } from "../lib/tauri/localSessions";
import {
  cancelTerminalClipboardStaging,
  startTerminalClipboardStaging,
  type TerminalStagingEvent,
} from "../lib/tauri/sessions";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import { parseOsc7Cwd } from "./osc7";
import { createResizeScheduler, type ResizeScheduler } from "./resizeScheduler";
import { createTerminalInputScheduler, type TerminalInputScheduler } from "./terminalInputScheduler";
import { ensureTerminalSearch, type TerminalSearchHost } from "./terminalSearch";
import { bindTerminalTheme, readTerminalSearchColors, readTerminalTheme } from "./terminalTheme";
import { registerTerminalController } from "./terminalViewRegistry";
import {
  TerminalStagingStatus,
  type TerminalStagingStatusState,
} from "./TerminalStagingStatus";

interface TerminalView extends TerminalSearchHost {
  fit: FitAddon;
  decoder: TextDecoder;
  element: HTMLElement;
  input: { dispose: () => void };
  cwdHandler: { dispose: () => void };
  osc7Enabled: boolean;
  onCwd: (cwd: string) => void;
  onKey: (event: KeyboardEvent) => boolean;
  write: (data: string) => Promise<void>;
  inputScheduler: TerminalInputScheduler;
  resize: { send: (columns: number, rows: number) => Promise<void> };
  resizeScheduler: ResizeScheduler;
  themeBinding: { dispose: () => void };
  disposeTimer: number | null;
}

type ClipboardPlatform = "mac" | "windows" | "linux";
type ContextMenuState = { anchorX: number; anchorY: number; x: number; y: number; placement: "above" | "below"; hasSelection: boolean };
type PendingPaste = { text: string; lines: number; characters: number };
type SearchResults = { resultIndex: number; resultCount: number };
type ActiveStagingTask = { sessionId: string; taskId: string };
type StagingCompletion = { kind: "completed"; remotePaths: string[] } | { kind: "cancelled" } | { kind: "failed" };

const terminalViews = new Map<string, TerminalView>();
const CLEAR_SCREEN_INPUT = "\x1bcls\r";
const FALLBACK_TERMINAL_FONT_FAMILY = "SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const FALLBACK_TERMINAL_FONT_SIZE = 13;
const FALLBACK_TERMINAL_LINE_HEIGHT = 1.22;
const LONG_PASTE_THRESHOLD = 1000;
const SEARCH_EXIT_DURATION_MS = 110;
const STAGING_RESULT_DURATION_MS = 2_200;
const STAGING_ERROR_DURATION_MS = 5_000;
const STAGING_EXIT_DURATION_MS = 120;
const IDLE_TERMINAL_STAGING_STATUS: TerminalStagingStatusState = { phase: "idle" };

export function TerminalPanel({ blockId, sessionKey, visible, local, osc7Enabled = true, terminalSettingsReady = true }: { blockId: string; sessionKey: string; visible: boolean; local: boolean; osc7Enabled?: boolean; terminalSettingsReady?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchCloseTimerRef = useRef<number | null>(null);
  const viewRef = useRef<TerminalView | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingPaste, setPendingPaste] = useState<PendingPaste | null>(null);
  const [searchMounted, setSearchMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults>({ resultIndex: 0, resultCount: 0 });
  const [stagingStatus, setStagingStatus] = useState<TerminalStagingStatusState>(IDLE_TERMINAL_STAGING_STATUS);
  const [stagingSessionId, setStagingSessionId] = useState<string | null>(null);
  const [stagingClosing, setStagingClosing] = useState(false);
  const [activeStagingTask, setActiveStagingTask] = useState<ActiveStagingTask | null>(null);
  const { hydrated = true, localTerminalCapabilities, registerWriter, setBlockCwd, startLocalBlock, writeBlock, resizeBlock, clearBlockBuffer, runtimes } = useWorkspace();
  const windowsPty = local ? localTerminalCapabilities?.windowsPty ?? undefined : undefined;
  const inputEnabled = runtimes[blockId]?.status === "connected";
  const connectedSessionId = runtimes[blockId]?.sessionId ?? null;
  const connectedSessionIdRef = useRef(connectedSessionId);
  const pasteRequestIdRef = useRef(0);
  const activeStagingTaskRef = useRef<ActiveStagingTask | null>(null);
  const clipboardPlatform = terminalClipboardPlatform();
  const desktopPlatform = currentDesktopPlatform();
  const writeRef = useRef(writeBlock);
  const resizeRef = useRef(resizeBlock);
  const startLocalRef = useRef(startLocalBlock);
  const osc7EnabledRef = useRef(osc7Enabled);
  useEffect(() => { writeRef.current = writeBlock; }, [writeBlock]);
  useEffect(() => { resizeRef.current = resizeBlock; }, [resizeBlock]);
  useEffect(() => { startLocalRef.current = startLocalBlock; }, [startLocalBlock]);
  useEffect(() => { connectedSessionIdRef.current = connectedSessionId; }, [connectedSessionId]);
  useEffect(() => { activeStagingTaskRef.current = activeStagingTask; }, [activeStagingTask]);
  useEffect(() => {
    if (stagingStatus.phase !== "uploaded" && stagingStatus.phase !== "pasted" && stagingStatus.phase !== "cancelled" && stagingStatus.phase !== "failed") return;
    const duration = stagingStatus.phase === "failed" ? STAGING_ERROR_DURATION_MS : STAGING_RESULT_DURATION_MS;
    const closeTimer = window.setTimeout(() => setStagingClosing(true), duration - STAGING_EXIT_DURATION_MS);
    const hideTimer = window.setTimeout(() => {
      setStagingStatus(IDLE_TERMINAL_STAGING_STATUS);
      setStagingSessionId(null);
      setStagingClosing(false);
    }, duration);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [stagingSessionId, stagingStatus.phase]);
  useEffect(() => () => {
    const task = activeStagingTaskRef.current;
    if (task) void cancelTerminalClipboardStaging(task.sessionId, task.taskId).catch(() => undefined);
  }, []);
  useEffect(() => {
    osc7EnabledRef.current = osc7Enabled;
    if (viewRef.current) viewRef.current.osc7Enabled = osc7Enabled;
  }, [osc7Enabled]);

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
    const view = viewRef.current;
    if (!view) return;
    await view.inputScheduler.runExclusive(async (capture) => {
      closeContextMenu(false);
      if (local) {
        const sessionId = connectedSessionIdRef.current;
        const pasteRequestId = ++pasteRequestIdRef.current;
        setStagingSessionId(sessionId);
        setStagingClosing(false);
        setStagingStatus({ operation: "local", phase: "preparing" });
        try {
          const result = await prepareLocalTerminalClipboardPaste();
          if (pasteRequestIdRef.current !== pasteRequestId || viewRef.current !== view || connectedSessionIdRef.current !== sessionId) return;
          if (result.kind === "empty") {
            setStagingStatus(IDLE_TERMINAL_STAGING_STATUS);
            setStagingSessionId(null);
          } else if (result.kind === "text") {
            setStagingStatus(IDLE_TERMINAL_STAGING_STATUS);
            setStagingSessionId(null);
            if (isGuardedPaste(result.text)) {
              setPendingPaste({ text: result.text, lines: pasteLineCount(result.text), characters: result.text.length });
              return;
            }
            await capture(() => view.terminal.paste(result.text));
          } else {
            await capture(() => view.terminal.paste(result.text));
            setStagingStatus({
              operation: "local",
              phase: "pasted",
              displayName: result.displayName,
              itemCount: result.itemCount,
            });
          }
        } catch (reason) {
          if (pasteRequestIdRef.current === pasteRequestId && viewRef.current === view && connectedSessionIdRef.current === sessionId) {
            setStagingSessionId(sessionId);
            setStagingClosing(false);
            setStagingStatus({ operation: "local", phase: "failed", message: terminalStagingErrorMessage(reason) });
          }
        }
        restoreTerminalFocus();
        return;
      }
      const sessionId = connectedSessionIdRef.current;
      if (!sessionId) { restoreTerminalFocus(); return; }
      const pasteRequestId = ++pasteRequestIdRef.current;
      let settleCompletion: (completion: StagingCompletion) => void = () => undefined;
      const completion = new Promise<StagingCompletion>((resolve) => { settleCompletion = resolve; });
      const updateFromEvent = (event: TerminalStagingEvent) => {
        if (event.type === "completed") settleCompletion({ kind: "completed", remotePaths: event.remotePaths });
        else if (event.type === "cancelled") settleCompletion({ kind: "cancelled" });
        else if (event.type === "failed") settleCompletion({ kind: "failed" });
        if (pasteRequestIdRef.current !== pasteRequestId || viewRef.current !== view || connectedSessionIdRef.current !== sessionId) return;
        if (event.type !== "preparing") {
          setStagingSessionId(sessionId);
          setStagingClosing(false);
        }
        switch (event.type) {
          case "preparing": break;
          case "scanning": setStagingStatus({ phase: "scanning", itemCount: event.itemCount }); break;
          case "started": setStagingStatus({ phase: "uploading", displayName: event.displayName, itemCount: event.itemCount, transferredBytes: 0, totalBytes: event.totalBytes }); break;
          case "progress": setStagingStatus((current) => ({ ...current, phase: "uploading", transferredBytes: event.transferredBytes, totalBytes: event.totalBytes })); break;
          case "completed":
            setStagingStatus((current) => ({ ...current, phase: "uploaded", transferredBytes: current.totalBytes }));
            break;
          case "cancelled":
            setStagingStatus((current) => ({ ...current, phase: "cancelled" }));
            break;
          case "failed":
            setStagingStatus((current) => ({ ...current, phase: "failed", message: "文件上传失败，请重试" }));
            break;
        }
      };
      try {
        const result = await startTerminalClipboardStaging(sessionId, updateFromEvent);
        if (viewRef.current !== view || connectedSessionIdRef.current !== sessionId) {
          return;
        }
        if (result.kind === "empty") {
          setStagingStatus(IDLE_TERMINAL_STAGING_STATUS);
          setStagingSessionId(null);
          restoreTerminalFocus();
          return;
        }
        if (result.kind === "text") {
          setStagingStatus(IDLE_TERMINAL_STAGING_STATUS);
          setStagingSessionId(null);
          if (isGuardedPaste(result.text)) {
            setPendingPaste({ text: result.text, lines: pasteLineCount(result.text), characters: result.text.length });
            return;
          }
          await capture(() => view.terminal.paste(result.text));
          restoreTerminalFocus();
          return;
        }
        const task = { sessionId, taskId: result.taskId };
        setActiveStagingTask(task);
        const final = await completion;
        setActiveStagingTask(null);
        if (final.kind !== "completed" || viewRef.current !== view || connectedSessionIdRef.current !== sessionId) return;
        const pastedPaths = final.remotePaths.join(" ");
        if (pastedPaths) {
          await capture(() => view.terminal.paste(pastedPaths));
          setStagingStatus((current) => ({ ...current, phase: "pasted" }));
        }
      } catch (reason) {
        if (viewRef.current === view && connectedSessionIdRef.current === sessionId && pasteRequestIdRef.current === pasteRequestId) {
          setActiveStagingTask(null);
          setStagingSessionId(sessionId);
          setStagingClosing(false);
          setStagingStatus({ phase: "failed", message: terminalStagingErrorMessage(reason) });
        }
      }
      restoreTerminalFocus();
    });
  }, [closeContextMenu, inputEnabled, local, restoreTerminalFocus]);

  const stopStaging = useCallback(() => {
    const task = activeStagingTaskRef.current;
    if (!task) return;
    setStagingStatus((current) => ({ ...current, phase: "stopping" }));
    setStagingClosing(false);
    void cancelTerminalClipboardStaging(task.sessionId, task.taskId).catch((reason) => {
      setActiveStagingTask(null);
      setStagingSessionId(task.sessionId);
      setStagingClosing(false);
      setStagingStatus((current) => ({ ...current, phase: "failed", message: terminalStagingErrorMessage(reason) }));
    });
  }, []);

  const selectAll = useCallback(() => {
    viewRef.current?.terminal.selectAll();
    closeContextMenu();
  }, [closeContextMenu]);

  const clearBuffer = useCallback(() => {
    clearBlockBuffer(blockId);
    closeContextMenu();
  }, [blockId, clearBlockBuffer, closeContextMenu]);

  const openSearch = useCallback(() => {
    if (searchCloseTimerRef.current !== null) window.clearTimeout(searchCloseTimerRef.current);
    searchCloseTimerRef.current = null;
    setContextMenu(null);
    setSearchMounted(true);
    setSearchOpen(true);
  }, []);

  const finishSearchClose = useCallback(() => {
    if (searchCloseTimerRef.current !== null) window.clearTimeout(searchCloseTimerRef.current);
    searchCloseTimerRef.current = null;
    setSearchMounted(false);
    restoreTerminalFocus();
  }, [restoreTerminalFocus]);

  const closeSearch = useCallback(() => {
    viewRef.current?.search?.clearDecorations();
    setSearchOpen(false);
    setSearchResults({ resultIndex: 0, resultCount: 0 });
    if (searchCloseTimerRef.current !== null) window.clearTimeout(searchCloseTimerRef.current);
    searchCloseTimerRef.current = window.setTimeout(finishSearchClose, SEARCH_EXIT_DURATION_MS);
  }, [finishSearchClose]);

  useEffect(() => () => {
    if (searchCloseTimerRef.current !== null) window.clearTimeout(searchCloseTimerRef.current);
  }, []);

  const runSearch = useCallback((direction: "next" | "previous", term = searchTerm, incremental = false) => {
    const view = viewRef.current;
    if (!view) return;
    view.onSearchResults = setSearchResults;
    const search = ensureTerminalSearch(view);
    if (!term) {
      search.clearDecorations();
      setSearchResults({ resultIndex: 0, resultCount: 0 });
      return;
    }
    const options: ISearchOptions = { ...terminalSearchOptions(), incremental };
    if (direction === "next") search.findNext(term, options);
    else search.findPrevious(term, options);
  }, [searchTerm]);

  function updateSearch(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    setSearchTerm(value);
    runSearch("next", value, true);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const view = acquireTerminalView(sessionKey, container, windowsPty, local ? 50 : 0);
    view.write = (data) => writeRef.current(blockId, new TextEncoder().encode(data));
    view.resize.send = (columns, rows) => resizeRef.current(blockId, columns, rows);
    view.osc7Enabled = osc7EnabledRef.current;
    view.onCwd = (cwd) => setBlockCwd(blockId, cwd);
    view.onSearchResults = setSearchResults;
    ensureTerminalSearch(view);
    viewRef.current = view;
    const unregisterWriter = registerWriter(
      blockId,
      (data) => view.terminal.write(view.decoder.decode(data, { stream: true })),
      (reset) => {
        if (reset) {
          view.decoder = new TextDecoder();
          view.terminal.reset();
        } else if (local && windowsPty?.backend === "conpty") {
          void view.inputScheduler.send(CLEAR_SCREEN_INPUT);
        } else {
          view.terminal.clear();
        }
      },
      () => {
        restoreTerminalLayout(view);
        return { columns: view.terminal.cols, rows: view.terminal.rows };
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
      view.write = async () => undefined;
      view.resize.send = async () => undefined;
      view.osc7Enabled = false;
      view.onCwd = () => undefined;
      view.onSearchResults = () => undefined;
      view.onKey = () => true;
      scheduleTerminalViewDisposal(sessionKey, view);
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [blockId, local, registerWriter, sessionKey, setBlockCwd, windowsPty]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.onKey = (event) => {
      if (resolveAppShortcut(event, desktopPlatform)?.type === "searchTerminal") {
        event.preventDefault();
        event.stopPropagation();
        openSearch();
        return false;
      }
      if (!handleClipboardShortcut(event, clipboardPlatform, view.terminal, inputEnabled, copySelection, requestPaste)) return false;
      return handleMacWordNavigationShortcut(event, clipboardPlatform, (data) => { void view.inputScheduler.send(data); });
    };
    return () => { view.onKey = () => true; };
  }, [clipboardPlatform, copySelection, desktopPlatform, inputEnabled, openSearch, requestPaste]);

  useEffect(() => registerTerminalController(blockId, {
    focus: () => viewRef.current?.terminal.focus(),
    openSearch,
  }), [blockId, openSearch]);

  useLayoutEffect(() => {
    if (!searchMounted || !searchOpen) return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [searchMounted, searchOpen]);

  useEffect(() => {
    if (!hydrated || !local || !terminalSettingsReady) return;
    const view = viewRef.current;
    if (view) void startLocalRef.current(blockId, view.terminal.cols, view.terminal.rows, osc7EnabledRef.current);
  }, [blockId, hydrated, local, terminalSettingsReady]);

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
    if (local || !visible || !inputEnabled || !connectedSessionId) return;
    let frame = 0;
    let cancelled = false;
    let attempts = 0;
    const synchronize = () => {
      if (cancelled) return;
      const view = viewRef.current;
      if (!view || !restoreTerminalLayout(view)) {
        attempts += 1;
        if (attempts < 12) frame = requestAnimationFrame(synchronize);
        return;
      }
      view.resizeScheduler.request(view.terminal.cols, view.terminal.rows, true);
    };
    frame = requestAnimationFrame(synchronize);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [blockId, connectedSessionId, inputEnabled, local, visible]);

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
    const view = viewRef.current;
    if (view) void view.inputScheduler.runExclusive((capture) => capture(() => view.terminal.paste(pendingPaste.text)));
    setPendingPaste(null);
    restoreTerminalFocus();
  }

  return <>
    <div className="terminal-surface" ref={containerRef} aria-label={`终端 ${blockId}`} onContextMenu={openContextMenu} onKeyDown={openKeyboardContextMenu}/>
    {stagingStatus.phase !== "idle" && stagingSessionId === connectedSessionId && <TerminalStagingStatus state={stagingStatus} closing={stagingClosing} canStop={activeStagingTask !== null} onStop={stopStaging}/>}
    {searchMounted && <div
      className="terminal-search"
      data-state={searchOpen ? "open" : "closing"}
      role="search"
      aria-label="搜索终端输出"
      onAnimationEnd={() => {
        if (searchOpen) return;
        finishSearchClose();
      }}
    >
      <label className="terminal-search-field">
        <Icon name="search" size={13}/>
        <ExactTextInput
          ref={searchInputRef}
          type="search"
          aria-label="搜索内容"
          placeholder="搜索终端输出"
          value={searchTerm}
          onChange={updateSearch}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); closeSearch(); }
            else if (event.key === "Enter") { event.preventDefault(); runSearch(event.shiftKey ? "previous" : "next"); }
          }}
        />
      </label>
      <span className={`terminal-search-results${searchTerm && searchResults.resultCount === 0 ? " empty" : ""}`} aria-live="polite">
        {searchTerm ? searchResults.resultCount > 0 && searchResults.resultIndex >= 0 ? `${searchResults.resultIndex + 1}/${searchResults.resultCount}` : "无结果" : ""}
      </span>
      <span className="terminal-search-navigation">
        <button type="button" aria-label="上一个匹配" disabled={!searchTerm} onClick={() => runSearch("previous")}><Icon name="back" size={12}/></button>
        <button type="button" aria-label="下一个匹配" disabled={!searchTerm} onClick={() => runSearch("next")}><Icon name="forward" size={12}/></button>
      </span>
      <button className="terminal-search-close" type="button" aria-label="关闭搜索" onClick={closeSearch}><Icon name="close" size={12}/></button>
    </div>}
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
      <button role="menuitem" onClick={openSearch}><span>搜索</span><kbd>{shortcutLabel("searchTerminal", desktopPlatform)}</kbd></button>
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

function handleMacWordNavigationShortcut(event: KeyboardEvent, platform: ClipboardPlatform, write: (data: string) => void): boolean {
  const hasSingleWordModifier = event.ctrlKey !== event.altKey;
  if (platform !== "mac" || event.type !== "keydown" || !hasSingleWordModifier || event.shiftKey || event.metaKey) return true;
  const input = event.key === "ArrowLeft" ? "\x1bb" : event.key === "ArrowRight" ? "\x1bf" : null;
  if (!input) return true;
  event.preventDefault();
  event.stopPropagation();
  write(input);
  return false;
}

function copyShortcutLabel(platform: ClipboardPlatform): string {
  return platform === "mac" ? "⌘C" : platform === "windows" ? "Ctrl+C" : "Ctrl+Shift+C";
}

function pasteShortcutLabel(platform: ClipboardPlatform): string {
  return platform === "mac" ? "⌘V" : platform === "windows" ? "Ctrl+V" : "Ctrl+Shift+V";
}

function terminalStagingErrorMessage(reason: unknown): string {
  if (reason && typeof reason === "object" && "message" in reason) {
    const message = String((reason as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return "文件上传失败，请重试";
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
    existing.terminal.options.theme = readTerminalTheme();
    ensureTerminalSearch(existing);
    container.append(existing.element);
    return existing;
  }

  const typography = terminalTypography();
  const terminal = new Terminal({
    cursorBlink: true,
    allowProposedApi: true,
    ...typography,
    scrollback: 8000,
    ...(windowsPty ? { windowsPty } : {}),
    allowTransparency: true,
    overviewRuler: { width: 3 },
    theme: readTerminalTheme(),
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
  const themeBinding = bindTerminalTheme((theme) => { terminal.options.theme = theme; });
  const writeTarget: { send: (data: string) => Promise<void> } = { send: () => Promise.resolve() };
  const inputScheduler = createTerminalInputScheduler((data) => writeTarget.send(data));
  const view: TerminalView = {
    terminal,
    fit,
    decoder: new TextDecoder(),
    element,
    input: { dispose: () => undefined },
    cwdHandler: { dispose: () => undefined },
    osc7Enabled: false,
    onCwd: () => undefined,
    onSearchResults: () => undefined,
    onKey: () => true,
    write: async () => undefined,
    inputScheduler,
    resize,
    resizeScheduler,
    themeBinding,
    disposeTimer: null,
  };
  writeTarget.send = (data) => view.write(data);
  terminal.attachCustomKeyEventHandler((event) => view.onKey(event));
  view.input = terminal.onData((data) => { void view.inputScheduler.send(data); });
  view.cwdHandler = terminal.parser.registerOscHandler(7, (data) => {
    if (!view.osc7Enabled) return true;
    const cwd = parseOsc7Cwd(data);
    if (cwd) view.onCwd(cwd);
    return true;
  });
  ensureTerminalSearch(view);
  terminalViews.set(sessionKey, view);
  return view;
}

function terminalSearchOptions(): ISearchOptions {
  const { matchBackground, activeMatchBackground } = readTerminalSearchColors();
  return {
    decorations: {
      matchBackground,
      matchOverviewRuler: matchBackground,
      activeMatchBackground,
      activeMatchColorOverviewRuler: activeMatchBackground,
    },
  };
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
    view.inputScheduler.dispose();
    view.cwdHandler.dispose();
    view.searchResultsHandler?.dispose();
    view.resizeScheduler.dispose();
    view.themeBinding.dispose();
    view.terminal.dispose();
    terminalViews.delete(sessionKey);
    view.disposeTimer = null;
  }, 0);
}
