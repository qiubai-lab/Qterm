import { acquireTerminalView, scheduleTerminalViewDisposal, type TerminalView } from "./terminalView";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { ISearchOptions } from "@xterm/addon-search";
import { writeText as writeClipboardText } from "@qterm/services/textClipboard";
import "@xterm/xterm/css/xterm.css";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { ExactTextInput } from "../components/ExactTextInput";
import { Icon } from "../components/Icon";
import { currentDesktopPlatform } from "../lib/tauri/window";
import { prepareLocalTerminalClipboardPaste } from "@qterm/services/localSessions";
import {
  cancelTerminalClipboardStaging,
  startTerminalClipboardStaging,
  type TerminalStagingEvent,
} from "@qterm/services/sessions";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import { terminalClipboardPlatform } from "./terminalClipboardShortcuts";
import { useTerminalInputBindings } from "./useTerminalInputBindings";
import { resetTerminalSession } from "./terminalSessionReset";
import { ensureTerminalSearch } from "./terminalSearch";
import { readTerminalSearchColors } from "./terminalTheme";
import { TerminalContextMenu } from "./TerminalContextMenu";
import { TerminalImageExportDialog } from "./imageExport/TerminalImageExportDialog";
import { useTerminalImageExport } from "./imageExport/useTerminalImageExport";
import { registerTerminalController } from "./terminalViewRegistry";
import {
  TerminalStagingStatus,
  type TerminalStagingStatusState,
} from "./TerminalStagingStatus";
type ContextMenuState = { anchorX: number; anchorY: number; x: number; y: number; placement: "above" | "below"; hasSelection: boolean };
type PendingPaste = { text: string; lines: number; characters: number };
type SearchResults = { resultIndex: number; resultCount: number };
type ActiveStagingTask = { sessionId: string; taskId: string };
type StagingCompletion = { kind: "completed"; remotePaths: string[] } | { kind: "cancelled" } | { kind: "failed" };
const CLEAR_SCREEN_INPUT = "\x1bcls\r";
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

  const imageExport = useTerminalImageExport(viewRef, containerRef, sessionKey, restoreTerminalFocus);

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
          resetTerminalSession(view.terminal);
        } else if (local && windowsPty?.backend === "conpty") {
          void view.inputScheduler.send(CLEAR_SCREEN_INPUT);
        } else {
          view.terminal.clear();
        }
      },
      () => {
        view.layout.restore();
        return { columns: view.terminal.cols, rows: view.terminal.rows };
      },
    );
    const observer = new ResizeObserver(() => {
      if (!container.offsetParent) return;
      view.layout.restore();
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

  useTerminalInputBindings(viewRef, sessionKey, clipboardPlatform, desktopPlatform, inputEnabled, copySelection, requestPaste, openSearch);

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
      if (!view || !view.layout.restore()) {
        attempts += 1;
        if (attempts < 12) frame = requestAnimationFrame(restore);
        return;
      }
    };
    frame = requestAnimationFrame(restore);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [blockId, local, visible]);

  useEffect(() => {
    if (!visible || !inputEnabled || !connectedSessionId) return;
    let frame = 0;
    let cancelled = false;
    let attempts = 0;
    const synchronize = () => {
      if (cancelled) return;
      const view = viewRef.current;
      if (!view || !view.layout.restore(true)) {
        attempts += 1;
        if (attempts < 12) frame = requestAnimationFrame(synchronize);
        return;
      }
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
    {contextMenu && <TerminalContextMenu state={contextMenu} menuRef={menuRef} platform={desktopPlatform} canPaste={inputEnabled} close={closeContextMenu}
      actions={{ copy: copySelection, paste: requestPaste, search: openSearch, selectAll, clear: clearBuffer, exportImage: () => { closeContextMenu(false); imageExport.open(); } }}/>}
    {imageExport.request && <TerminalImageExportDialog request={imageExport.request} onClose={imageExport.close}/>}
    {pendingPaste && createPortal(<DialogFrame compact title="确认粘贴？" subtitle="多行或较长内容可能立即执行命令" onClose={() => { setPendingPaste(null); restoreTerminalFocus(); }}>
      <p className="confirm-copy">剪贴板包含 {pendingPaste.lines} 行、{pendingPaste.characters} 个字符。确认只会把内容发送到当前终端，不会在此处显示剪贴板正文。</p>
      <footer className="dialog-actions end"><button className="secondary-button" onClick={() => { setPendingPaste(null); restoreTerminalFocus(); }}>取消</button><button data-dialog-autofocus className="primary-button" disabled={!inputEnabled} onClick={confirmPaste}>粘贴到终端</button></footer>
    </DialogFrame>, document.body)}
  </>;
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
