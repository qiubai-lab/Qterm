import { vi } from "vitest";

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
  prepareLocalTerminalClipboardPaste: vi.fn(),
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

vi.mock("../lib/tauri/localSessions", () => ({
  prepareLocalTerminalClipboardPaste: mocks.prepareLocalTerminalClipboardPaste,
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
    write = vi.fn((_data: string, callback?: () => void) => callback?.());
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

export class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

export { mocks };
