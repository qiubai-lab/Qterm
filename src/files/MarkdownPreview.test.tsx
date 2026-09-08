import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownPreview } from "./MarkdownPreview";

const mocks = vi.hoisted(() => ({ openUrl: vi.fn() }));

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MarkdownPreview", () => {
  beforeEach(() => {
    mocks.openUrl.mockReset().mockResolvedValue(undefined);
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
});
