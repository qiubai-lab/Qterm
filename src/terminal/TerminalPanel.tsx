import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

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
  write: (data: string) => void;
  resize: { send: (columns: number, rows: number) => Promise<void> };
  resizeScheduler: ResizeScheduler;
  disposeTimer: number | null;
}

const terminalViews = new Map<string, TerminalView>();
const CLEAR_SCREEN_INPUT = "\x1bcls\r";
const FALLBACK_TERMINAL_FONT_FAMILY = "SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export function TerminalPanel({ blockId, sessionKey, visible, local }: { blockId: string; sessionKey: string; visible: boolean; local: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<TerminalView | null>(null);
  const { hydrated = true, localTerminalCapabilities, registerWriter, setBlockCwd, startLocalBlock, writeBlock, resizeBlock } = useWorkspace();
  const windowsPty = local ? localTerminalCapabilities?.windowsPty ?? undefined : undefined;
  const writeRef = useRef(writeBlock);
  const resizeRef = useRef(resizeBlock);
  const startLocalRef = useRef(startLocalBlock);
  useEffect(() => { writeRef.current = writeBlock; }, [writeBlock]);
  useEffect(() => { resizeRef.current = resizeBlock; }, [resizeBlock]);
  useEffect(() => { startLocalRef.current = startLocalBlock; }, [startLocalBlock]);

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
      scheduleTerminalViewDisposal(sessionKey, view);
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [blockId, local, registerWriter, sessionKey, setBlockCwd, windowsPty]);

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

  return <div className="terminal-surface" ref={containerRef} aria-label={`终端 ${blockId}`} />;
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
    container.append(existing.element);
    return existing;
  }

  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: terminalFontFamily(),
    fontSize: 13,
    lineHeight: 1.22,
    scrollback: 8000,
    ...(windowsPty ? { windowsPty } : {}),
    allowTransparency: true,
    overviewRuler: { width: 3 },
    theme: {
      background: "rgba(5, 7, 8, 0.78)",
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
    },
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
    write: () => undefined,
    resize,
    resizeScheduler,
    disposeTimer: null,
  };
  view.input = terminal.onData((data) => view.write(data));
  view.cwdHandler = terminal.parser.registerOscHandler(7, (data) => {
    const cwd = parseOsc7Cwd(data);
    if (cwd) view.onCwd(cwd);
    return true;
  });
  terminalViews.set(sessionKey, view);
  return view;
}

function terminalFontFamily(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--terminal-font-family").trim()
    || FALLBACK_TERMINAL_FONT_FAMILY;
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
