import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownPreview } from "./MarkdownPreview";

const mocks = vi.hoisted(() => ({ openUrl: vi.fn(), writeClipboardText: vi.fn() }));

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: mocks.writeClipboardText }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MarkdownPreview", () => {
  beforeEach(() => {
    mocks.openUrl.mockReset().mockResolvedValue(undefined);
    mocks.writeClipboardText.mockReset().mockResolvedValue(undefined);
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("renders Markdown without loading embedded remote images", () => {
    render(<MarkdownPreview content={'# Hello\n\n![secret](https://example.com/remote.png)'}/>);

    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("[图片已禁用：secret]")).toBeInTheDocument();
  });

  it("opens HTTP links externally without navigating the Tauri webview", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    render(<MarkdownPreview content="[Qterm docs](https://example.com/docs)"/>);

    expect(fireEvent.click(screen.getByRole("link", { name: "Qterm docs" }))).toBe(false);
    await waitFor(() => expect(mocks.openUrl).toHaveBeenCalledWith("https://example.com/docs"));
  });

  it("opens HTTP links in a new tab in the browser preview", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<MarkdownPreview content="[Qterm docs](http://example.com/docs)"/>);

    expect(fireEvent.click(screen.getByRole("link", { name: "Qterm docs" }))).toBe(false);
    expect(open).toHaveBeenCalledWith("http://example.com/docs", "_blank", "noopener,noreferrer");
  });

  it("does not expose relative or unsafe Markdown targets as navigable links", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<MarkdownPreview content={'[relative](./README.md)\n\n[script](javascript:alert("x"))'}/>);

    const relative = screen.getByText("relative");
    expect(screen.queryByRole("link", { name: "relative" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "script" })).not.toBeInTheDocument();
    expect(relative).toHaveClass("markdown-disabled-link");
    expect(relative).toHaveAttribute("title", "./README.md");

    fireEvent.click(relative);
    expect(open).not.toHaveBeenCalled();
    expect(mocks.openUrl).not.toHaveBeenCalled();
  });

  it("copies only a selection contained by the Markdown preview and can select all", async () => {
    render(<><span>Outside selection</span><MarkdownPreview content="**First paragraph**\n\nSecond paragraph"/></>);
    const preview = screen.getByRole("article", { name: "Markdown 文件预览" });
    const first = screen.getByText("First paragraph");
    const range = document.createRange();
    range.selectNodeContents(first);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    fireEvent.contextMenu(first, { clientX: 40, clientY: 50 });
    let menu = screen.getByRole("menu", { name: "Markdown 预览菜单" });
    expect(within(menu).getByRole("menuitem", { name: /复制/ })).toBeEnabled();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /复制/ }));
    await waitFor(() => expect(mocks.writeClipboardText).toHaveBeenCalledWith("First paragraph"));

    const outsideRange = document.createRange();
    outsideRange.selectNodeContents(screen.getByText("Outside selection"));
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(outsideRange);
    fireEvent.contextMenu(preview);
    menu = screen.getByRole("menu", { name: "Markdown 预览菜单" });
    expect(within(menu).getByRole("menuitem", { name: /复制/ })).toBeDisabled();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /全选/ }));
    expect(window.getSelection()?.toString()).toContain("First paragraph");
    expect(window.getSelection()?.toString()).toContain("Second paragraph");
  });

  it("keeps a pointer-invoked text selection active while its menu is open", async () => {
    render(<MarkdownPreview content="Selected preview text"/>);
    const preview = screen.getByRole("article", { name: "Markdown 文件预览" });
    const text = screen.getByText("Selected preview text");
    preview.focus();
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    fireEvent.contextMenu(text);
    await waitFor(() => expect(screen.getByRole("menu", { name: "Markdown 预览菜单" })).toBeInTheDocument());
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(preview).toHaveFocus();
    expect(window.getSelection()?.toString()).toBe("Selected preview text");
  });

  it("copies the actual HTTP link address only when a web link was targeted", async () => {
    render(<MarkdownPreview content="[Qterm docs](https://example.com/docs) and plain text"/>);
    const link = screen.getByRole("link", { name: "Qterm docs" });

    fireEvent.contextMenu(link);
    let menu = screen.getByRole("menu", { name: "Markdown 预览菜单" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "复制链接地址" }));
    await waitFor(() => expect(mocks.writeClipboardText).toHaveBeenCalledWith("https://example.com/docs"));

    fireEvent.contextMenu(screen.getByText(/plain text/));
    menu = screen.getByRole("menu", { name: "Markdown 预览菜单" });
    expect(within(menu).queryByRole("menuitem", { name: "复制链接地址" })).not.toBeInTheDocument();
  });

  it("opens its menu from Shift+F10 and restores preview focus on Escape", async () => {
    render(<MarkdownPreview content="Keyboard preview"/>);
    const preview = screen.getByRole("article", { name: "Markdown 文件预览" });
    preview.focus();

    fireEvent.keyDown(preview, { key: "F10", shiftKey: true });
    const menu = screen.getByRole("menu", { name: "Markdown 预览菜单" });
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: /全选/ })).toHaveFocus());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(preview).toHaveFocus());
  });
});
