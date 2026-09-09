import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSearchBar } from "./FileSearchBar";

afterEach(cleanup);

describe("FileSearchBar", () => {
  it("reports results and maps keyboard navigation", () => {
    const onMove = vi.fn();
    const onClose = vi.fn();
    render(<FileSearchBar query="term" activeIndex={1} resultCount={3} onQueryChange={vi.fn()} onMove={onMove} onClose={onClose}/>);

    const input = screen.getByRole("searchbox", { name: "搜索内容" });
    expect(input).toHaveFocus();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onMove).toHaveBeenNthCalledWith(1, "next");
    expect(onMove).toHaveBeenNthCalledWith(2, "previous");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows an empty result and disables navigation", () => {
    render(<FileSearchBar query="missing" activeIndex={-1} resultCount={0} onQueryChange={vi.fn()} onMove={vi.fn()} onClose={vi.fn()}/>);

    expect(screen.getByText("无结果")).toHaveClass("empty");
    expect(screen.getByRole("button", { name: "上一个匹配" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一个匹配" })).toBeDisabled();
  });

  it("discloses when dense results are capped", () => {
    render(<FileSearchBar query="a" activeIndex={0} resultCount={5000} truncated onQueryChange={vi.fn()} onMove={vi.fn()} onClose={vi.fn()}/>);
    expect(screen.getByText("1/5000+")).toBeInTheDocument();
  });
});
