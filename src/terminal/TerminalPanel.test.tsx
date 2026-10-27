import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mocks, ResizeObserverMock } from "./terminalPanelTestFixture";

import { TerminalPanel } from "./TerminalPanel";
import { parseOsc7Cwd } from "./osc7";
import { ensureTerminalSearch } from "./terminalSearch";

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
    mocks.prepareLocalTerminalClipboardPaste.mockReset().mockResolvedValue({ kind: "empty" });
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
    expect(terminal.options.linkHandler).toBeDefined();

    view.rerender(<Layout split/>);

    expect(mocks.terminals).toHaveLength(1);
    expect(terminal.dispose).not.toHaveBeenCalled();
    expect(terminal.loadAddon).toHaveBeenCalledTimes(4);
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
    clear?.(true);
    expect(terminal.write).toHaveBeenCalledWith("\x1bc");
    expect(terminal.reset).not.toHaveBeenCalled();
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
    expect(fit.fit).toHaveBeenCalledTimes(2);
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

  it.each([false, true])("force-synchronizes dimensions when a session becomes available (local=%s)", async local => {
    mocks.runtimes = { "block-ssh-size": { status: "connecting", sessionId: null } };
    const view = render(<TerminalPanel blockId="block-ssh-size" sessionKey="block-ssh-size:ssh" local={local} visible/>);
    await act(async () => vi.runAllTimersAsync());
    mocks.resizeBlock.mockClear();

    mocks.runtimes = { "block-ssh-size": { status: "connected", sessionId: "ssh-1" } };
    view.rerender(<TerminalPanel blockId="block-ssh-size" sessionKey="block-ssh-size:ssh" local={local} visible/>);
    await act(async () => vi.runAllTimersAsync());

    expect(mocks.resizeBlock).toHaveBeenCalledWith("block-ssh-size", 80, 24);
    view.unmount();
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
