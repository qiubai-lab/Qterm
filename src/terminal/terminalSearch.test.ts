import { describe, expect, it, vi } from "vitest";

describe("terminal buffer search integration", () => {
  it("finds visible text in a real xterm buffer and reports its result", async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillStyle: "#000000" } as unknown as CanvasRenderingContext2D);
    const [{ SearchAddon }, { Terminal }] = await Promise.all([import("@xterm/addon-search"), import("@xterm/xterm")]);
    const terminal = new Terminal({ allowProposedApi: true, cols: 80, rows: 24 });
    const search = new SearchAddon();
    const onResults = vi.fn();
    terminal.loadAddon(search);
    search.onDidChangeResults(onResults);
    vi.spyOn(terminal, "getSelectionPosition").mockReturnValue(undefined);
    vi.spyOn(terminal, "clearSelection").mockImplementation(() => undefined);
    vi.spyOn(terminal, "select").mockImplementation(() => undefined);

    await new Promise<void>((resolve) => {
      terminal.write("Documentation: https://help.ubuntu.com\r\nThis system has been minimized\r\n", resolve);
    });

    expect(search.findNext("SYSTEM", { decorations: { matchOverviewRuler: "#153b35", activeMatchColorOverviewRuler: "#75e6cf" } })).toBe(true);
    expect(onResults).toHaveBeenLastCalledWith({ resultIndex: 0, resultCount: 1 });
    expect(search.findPrevious("Documentation")).toBe(true);
    expect(search.findNext("not-present")).toBe(false);

    terminal.dispose();
    getContext.mockRestore();
  });
});
