import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderedTerminalImage } from "./renderTerminalImage";
import type { TerminalImageRequest } from "./useTerminalImageExport";

const mocks = vi.hoisted(() => ({ render: vi.fn(), copy: vi.fn(), save: vi.fn() }));
vi.mock("./renderTerminalImage", () => ({ renderTerminalImage: mocks.render }));
vi.mock("../../lib/tauri/clipboard", () => ({ copyImageUrlToClipboard: mocks.copy }));
vi.mock("../../lib/tauri/terminalImage", () => ({ saveTerminalImage: mocks.save }));
import { TerminalImageExportDialog } from "./TerminalImageExportDialog";

const request: TerminalImageRequest = {
  sessionKey: "test", error: "", theme: "light", style: "macos",
  snapshot: { width: 810, left: 7, cellWidth: 8, cellHeight: 16, fontFamily: "monospace", fontSize: 13, fontWeight: "normal", fontWeightBold: "bold", brightBold: true, columns: 100, lines: [[], []] },
};
function image(url = "blob:test"): RenderedTerminalImage {
  return { blob: new Blob(["png"], { type: "image/png" }), url, width: 1620, height: 188, dispose: vi.fn() };
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  mocks.render.mockReset().mockImplementation(async () => image());
  mocks.copy.mockReset().mockResolvedValue(undefined);
  mocks.save.mockReset().mockResolvedValue("/chosen/terminal.png");
  document.documentElement.dataset.theme = "cyberpunk";
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme; });

describe("terminal image preview dialog", () => {
  it("offers exactly three styles and three themes, defaults to the captured choice and leaves the app theme alone", async () => {
    render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    await screen.findByRole("img");
    expect(screen.getByRole("group", { name: "图片样式" }).querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByRole("group", { name: "图片样式" }).closest(".dialog-header")).not.toBeNull();
    expect(screen.getByRole("group", { name: "图片主题" }).querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "浅色" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Windows" }));
    fireEvent.click(screen.getByRole("button", { name: "深色" }));
    await waitFor(() => expect(mocks.render).toHaveBeenLastCalledWith(request.snapshot, "windows", "dark", 2));
    expect(document.documentElement.dataset.theme).toBe("cyberpunk");
    expect(screen.queryByText("主题", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MacOS" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("copies or saves the displayed result, supports cancel and retries failures", async () => {
    const result = image(); mocks.render.mockResolvedValue(result);
    render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    await screen.findByRole("img");
    mocks.copy.mockRejectedValueOnce(new Error("剪贴板忙，请重试"));
    fireEvent.click(screen.getByRole("button", { name: "复制图片" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("剪贴板忙");
    expect(screen.getByRole("alert").closest("[data-action]")).toHaveAttribute("data-action", "copy");
    fireEvent.click(screen.getByRole("button", { name: "复制图片" }));
    await screen.findByText("图片已复制");
    expect(screen.getByRole("status").closest("[data-action]")).toHaveAttribute("data-action", "copy");
    expect(mocks.copy).toHaveBeenCalledWith(result.url);
    mocks.save.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "保存 PNG" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "保存 PNG" })).toBeEnabled());
    expect(screen.queryByText("图片已保存")).not.toBeInTheDocument();
    mocks.save.mockRejectedValueOnce({ message: "磁盘不可写" });
    fireEvent.click(screen.getByRole("button", { name: "保存 PNG" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("磁盘不可写");
    expect(screen.getByRole("alert").closest("[data-action]")).toHaveAttribute("data-action", "save");
    fireEvent.click(screen.getByRole("button", { name: "保存 PNG" }));
    await screen.findByText("图片已保存");
    expect(screen.getByRole("status").closest("[data-action]")).toHaveAttribute("data-action", "save");
    expect(mocks.save).toHaveBeenLastCalledWith(result.blob);
  });

  it("expires feedback, restarts its lifetime for repeated actions, and clears it when the image changes", async () => {
    render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    await screen.findByRole("img");
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "复制图片" })); });
    const first = screen.getByRole("status");
    act(() => vi.advanceTimersByTime(2000));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "复制图片" })); });
    expect(screen.getByRole("status")).not.toBe(first);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("status")).toHaveTextContent("图片已复制");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    mocks.save.mockRejectedValueOnce(new Error("保存失败"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "保存 PNG" })); });
    act(() => vi.advanceTimersByTime(4900));
    expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "复制图片" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Windows" })); });
    expect(screen.queryByText("图片已复制")).not.toBeInTheDocument();
  });

  it("discards stale rendering and releases every image when replaced or closed", async () => {
    let finishFirst!: (value: RenderedTerminalImage) => void;
    mocks.render.mockReturnValueOnce(new Promise<RenderedTerminalImage>(resolve => { finishFirst = resolve; }));
    const current = image("blob:current"); mocks.render.mockResolvedValueOnce(current);
    const view = render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    expect(screen.getByRole("button", { name: "复制图片" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Linux" }));
    expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:current");
    const stale = image("blob:stale");
    await act(async () => finishFirst(stale));
    expect(stale.dispose).toHaveBeenCalledOnce();
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:current");
    view.unmount();
    expect(current.dispose).toHaveBeenCalledOnce();
  });

  it("does not apply an in-flight operation result after closing and keeps settings stable while copying", async () => {
    let finish!: () => void;
    mocks.copy.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const view = render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "复制图片" }));
    expect(screen.getByRole("button", { name: "Windows" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "浅色" })).toBeDisabled();
    view.unmount();
    await act(async () => finish());
    expect(screen.queryByText("图片已复制")).not.toBeInTheDocument();
  });

  it("shows a spinner without replacing or rerendering the preview during export", async () => {
    let finish!: (path: string) => void;
    mocks.save.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }));
    render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    const img = await screen.findByRole("img");
    const region = screen.getByRole("region", { name: "图片预览" });
    region.scrollTop = 120;
    fireEvent.click(screen.getByRole("button", { name: "保存 PNG" }));
    const saving = screen.getByRole("button", { name: "正在保存…" });
    expect(saving).toHaveAttribute("aria-busy", "true");
    expect(saving.querySelector('[data-loading="true"] .terminal-image-spinner')).not.toBeNull();
    expect(screen.getByRole("img")).toBe(img);
    expect(region.scrollTop).toBe(120);
    await act(async () => finish("/chosen/terminal.png"));
    expect(screen.getByRole("img")).toBe(img);
    expect(screen.getByRole("region", { name: "图片预览" })).toBe(region);
    expect(region.scrollTop).toBe(120);
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("图片已保存");
  });

  it("retains the previous preview until a new selection is ready and never exports stale content", async () => {
    const previous = image("blob:previous");
    mocks.render.mockResolvedValueOnce(previous);
    let finish!: (value: RenderedTerminalImage) => void;
    mocks.render.mockReturnValueOnce(new Promise<RenderedTerminalImage>(resolve => { finish = resolve; }));
    render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    const img = await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Windows" }));
    expect(screen.getByRole("img")).toBe(img);
    expect(img).toHaveAttribute("src", "blob:previous");
    for (const name of ["保存 PNG", "复制图片"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("data-available", "true");
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(previous.dispose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存 PNG" })).toBeDisabled();
    expect(screen.getByRole("region")).toHaveAttribute("aria-busy", "true");
    await act(async () => finish(image("blob:next")));
    expect(img).toHaveAttribute("src", "blob:next");
    for (const name of ["保存 PNG", "复制图片"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("data-available", "true");
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(previous.dispose).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "保存 PNG" })).toBeEnabled();
  });

  it("defaults to M, renders the chosen scale and retains it across appearance changes", async () => {
    render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    await screen.findByRole("img");
    const sizeShell = screen.getByRole("group", { name: "导出图片尺寸" }).parentElement!;
    expect(sizeShell).toHaveClass("terminal-image-size-shell");
    expect(sizeShell.firstElementChild).toHaveClass("terminal-image-size-caption");
    expect(sizeShell.children[1]).toHaveClass("terminal-image-sizes");
    expect(sizeShell.lastElementChild).toHaveClass("terminal-image-pixel-size");
    const sizeControl = sizeShell.parentElement!;
    expect(sizeControl.nextElementSibling).toHaveAttribute("data-action", "save");
    expect(screen.getByText("尺寸")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "M" })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["S", "M", "L"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toHaveTextContent(label);
      expect(button.children).toHaveLength(0);
    }
    expect(screen.getByText("1620 × 196 px")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "S" }));
    await waitFor(() => expect(mocks.render).toHaveBeenLastCalledWith(request.snapshot, "macos", "light", 1));
    expect(screen.getByText("810 × 98 px")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "L" }));
    fireEvent.click(screen.getByRole("button", { name: "Windows" }));
    await waitFor(() => expect(mocks.render).toHaveBeenLastCalledWith(request.snapshot, "windows", "light", 3));
    expect(screen.getByText("2430 × 294 px")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L" })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to S when M is too large and explains unavailable sizes without rendering them", async () => {
    const large = { ...request, snapshot: { ...request.snapshot!, width: 1000, lines: Array.from({ length: 400 }, () => []) } };
    render(<TerminalImageExportDialog request={large} onClose={vi.fn()}/>);
    await screen.findByRole("img");
    expect(mocks.render).toHaveBeenLastCalledWith(large.snapshot, "macos", "light", 1);
    expect(screen.getByRole("button", { name: "S" })).toHaveAttribute("aria-pressed", "true");
    const medium = screen.getByRole("button", { name: "M" });
    expect(medium).toHaveAttribute("aria-disabled", "true");
    fireEvent.focus(medium);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("超出图片尺寸限制");
    fireEvent.click(medium);
    fireEvent.click(screen.getByRole("button", { name: "L" }));
    expect(mocks.render).toHaveBeenCalledOnce();
  });

  it("keeps the preview and button appearance stable while sizing and exports only the latest scale", async () => {
    let finishSmall!: (value: RenderedTerminalImage) => void;
    let finishLarge!: (value: RenderedTerminalImage) => void;
    render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    const img = await screen.findByRole("img");
    mocks.render.mockReturnValueOnce(new Promise<RenderedTerminalImage>(resolve => { finishSmall = resolve; }));
    mocks.render.mockReturnValueOnce(new Promise<RenderedTerminalImage>(resolve => { finishLarge = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "S" }));
    fireEvent.click(screen.getByRole("button", { name: "L" }));
    const save = screen.getByRole("button", { name: "保存 PNG" });
    expect(save).toHaveAttribute("data-available", "true");
    expect(save).toBeDisabled();
    expect(screen.getByRole("img")).toBe(img);
    const stale = image("blob:small");
    await act(async () => finishSmall(stale));
    expect(stale.dispose).toHaveBeenCalledOnce();
    const latest = image("blob:large");
    await act(async () => finishLarge(latest));
    fireEvent.click(save);
    await screen.findByText("图片已保存");
    expect(mocks.save).toHaveBeenCalledWith(latest.blob);
    fireEvent.click(screen.getByRole("button", { name: "复制图片" }));
    await screen.findByText("图片已复制");
    expect(mocks.copy).toHaveBeenCalledWith("blob:large");
  });

  it("handles oversized selections and render errors without enabling export", async () => {
    const view = render(<TerminalImageExportDialog request={{ ...request, snapshot: null, error: "请减少行数后重新导出" }} onClose={vi.fn()}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("减少行数");
    expect(mocks.render).not.toHaveBeenCalled();
    view.unmount();
    mocks.render.mockRejectedValueOnce(new Error("图片生成失败"));
    render(<TerminalImageExportDialog request={request} onClose={vi.fn()}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("图片生成失败");
    expect(screen.getByRole("button", { name: "保存 PNG" })).toBeDisabled();
  });
});
