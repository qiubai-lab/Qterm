import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { writeText as writeClipboardText } from "@qterm/services/textClipboard";
import { parseOsc7Cwd } from "./osc7";
import { createTerminalLayout, type TerminalLayout } from "./terminalLayout";
import { createTerminalInputScheduler, type TerminalInputScheduler } from "./terminalInputScheduler";
import { createTerminalOsc52Addon } from "./terminalOsc52";
import { createTerminalOsc8LinkHandler } from "./terminalOsc8Link";
import { createTerminalWebLinksAddon } from "./terminalWebLinks";
import { ensureTerminalSearch, type TerminalSearchHost } from "./terminalSearch";
import { bindTerminalTheme, readTerminalTheme } from "./terminalTheme";

export interface TerminalView extends TerminalSearchHost {
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
  layout: TerminalLayout;
  themeBinding: { dispose: () => void };
  disposeTimer: number | null;
}
const terminalViews = new Map<string, TerminalView>();
const FALLBACK_TERMINAL_FONT_FAMILY = "SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const FALLBACK_TERMINAL_FONT_SIZE = 13;
const FALLBACK_TERMINAL_LINE_HEIGHT = 1.22;

export function acquireTerminalView(sessionKey: string, container: HTMLElement, windowsPty: { backend: "conpty"; buildNumber: number } | undefined, resizeDelayMs: number): TerminalView {
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
  const getBlockId = () => terminal.element?.closest<HTMLElement>("[data-layout-block]")?.dataset.layoutBlock;
  const terminal: Terminal = new Terminal({
    cursorBlink: true,
    allowProposedApi: true,
    ...typography,
    scrollback: 8000,
    ...(windowsPty ? { windowsPty } : {}),
    allowTransparency: true,
    overviewRuler: { width: 3 },
    linkHandler: createTerminalOsc8LinkHandler(getBlockId),
    theme: readTerminalTheme(),
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.loadAddon(createTerminalOsc52Addon(writeClipboardText));
  terminal.loadAddon(createTerminalWebLinksAddon(getBlockId));
  terminal.open(container);
  const element = terminal.element;
  if (!element) {
    terminal.dispose();
    throw new Error("xterm did not create a terminal element");
  }
  const resize: TerminalView["resize"] = { send: async () => undefined };
  fit.fit();
  const layout = createTerminalLayout(terminal, fit, (columns, rows) => resize.send(columns, rows), resizeDelayMs);
  const themeBinding = bindTerminalTheme((theme) => { terminal.options.theme = theme; });
  const writeTarget: { send: (data: string) => Promise<void> } = { send: () => Promise.resolve() };
  const inputScheduler = createTerminalInputScheduler((data) => writeTarget.send(data));
  const view: TerminalView = {
    terminal,
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
    layout,
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

export function scheduleTerminalViewDisposal(sessionKey: string, view: TerminalView) {
  view.disposeTimer = window.setTimeout(() => {
    if (terminalViews.get(sessionKey) !== view || view.disposeTimer === null) return;
    view.input.dispose();
    view.inputScheduler.dispose();
    view.cwdHandler.dispose();
    view.searchResultsHandler?.dispose();
    view.layout.dispose();
    view.themeBinding.dispose();
    view.terminal.dispose();
    terminalViews.delete(sessionKey);
    view.disposeTimer = null;
  }, 0);
}
