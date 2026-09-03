import { createRef } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GitChange } from "../lib/tauri/git";
import { GitChangeList } from "./GitChangeList";
import { GIT_CHANGE_ROW_HEIGHT, GIT_CHANGE_VIRTUAL_THRESHOLD } from "./gitChangeListModel";

afterEach(cleanup);

function changes(count: number): GitChange[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `file-${String(index).padStart(5, "0")}.ts`,
    originalPath: null,
    status: "M",
    staged: false,
    conflict: false,
  }));
}

function renderList(items: GitChange[], onAction = vi.fn(), onSelect?: (change: GitChange, index: number) => void) {
  const scrollRef = createRef<HTMLDivElement>();
  const view = render(<div ref={scrollRef} data-testid="scroll-container">
    <GitChangeList
      scrollContainerRef={scrollRef}
      title="更改"
      changes={items}
      actionLabel="暂存"
      actionIcon="plus"
      onAction={onAction}
      onPreview={onSelect ? vi.fn() : undefined}
      onSelect={onSelect}
    />
  </div>);
  return { ...view, scrollRef, onAction };
}

describe("GitChangeList", () => {
  it("mounts only a bounded window for 5,000 changes", () => {
    renderList(changes(5_000));

    const list = screen.getByRole("list", { name: "更改文件" });
    expect(list).toHaveAttribute("aria-setsize", "5000");
    expect(within(list).getAllByRole("listitem").length).toBeLessThan(40);
    expect(screen.queryByText(/请使用终端处理/)).not.toBeInTheDocument();
  });

  it("renders and operates the last change after scrolling to the end", () => {
    const items = changes(5_000);
    const onSelect = vi.fn();
    const { scrollRef, onAction } = renderList(items, vi.fn(), onSelect);
    const scroll = scrollRef.current!;
    const list = screen.getByRole("list", { name: "更改文件" });
    const viewportHeight = GIT_CHANGE_ROW_HEIGHT * 10;
    let scrollTop = 0;
    Object.defineProperty(scroll, "clientHeight", { configurable: true, value: viewportHeight });
    Object.defineProperty(scroll, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => { scrollTop = value; },
    });
    scroll.getBoundingClientRect = () => ({ top: 0, bottom: viewportHeight, height: viewportHeight, left: 0, right: 500, width: 500, x: 0, y: 0, toJSON: () => ({}) });
    list.getBoundingClientRect = () => ({ top: -scrollTop, bottom: items.length * GIT_CHANGE_ROW_HEIGHT - scrollTop, height: items.length * GIT_CHANGE_ROW_HEIGHT, left: 0, right: 500, width: 500, x: 0, y: -scrollTop, toJSON: () => ({}) });

    scroll.scrollTop = items.length * GIT_CHANGE_ROW_HEIGHT - viewportHeight;
    fireEvent.scroll(scroll);

    const lastAction = screen.getByRole("button", { name: "暂存 file-04999.ts" });
    const lastRow = lastAction.closest("[role='listitem']");
    expect(lastRow).toHaveAttribute("aria-posinset", "5000");
    expect(lastRow).toHaveAttribute("aria-setsize", "5000");
    fireEvent.click(screen.getByRole("button", { name: "预览工作区更改 file-04999.ts" }));
    expect(onSelect).toHaveBeenCalledWith(items[4_999], 4_999, expect.anything());
    fireEvent.click(lastAction);
    expect(onAction).toHaveBeenCalledWith(items[4_999]);
  });

  it("renders every row below the virtualization threshold", () => {
    const items = changes(GIT_CHANGE_VIRTUAL_THRESHOLD);
    renderList(items);
    expect(within(screen.getByRole("list", { name: "更改文件" })).getAllByRole("listitem")).toHaveLength(items.length);
  });
});
