import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FileTextContextMenu } from "./FileTextContextMenu";

describe("FileTextContextMenu", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 190 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 120 });
  });
  afterEach(cleanup);

  it("fits above the viewport edge and invokes an item after dismissing", async () => {
    const onDismiss = vi.fn();
    const onSelect = vi.fn();
    render(<FileTextContextMenu
      anchor={{ x: window.innerWidth - 2, y: window.innerHeight - 2 }}
      label="文本菜单"
      groups={[[{ label: "复制", shortcut: "Ctrl+C", onSelect }]]}
      onDismiss={onDismiss}
    />);

    const menu = screen.getByRole("menu", { name: "文本菜单" });
    await waitFor(() => expect(menu).toHaveAttribute("data-placement", "above"));
    expect(Number.parseFloat(menu.style.left)).toBeLessThan(window.innerWidth - 2);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /复制/ }));
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(false);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("skips disabled items during roving navigation and restores focus on keyboard dismissal", async () => {
    const onDismiss = vi.fn();
    render(<FileTextContextMenu
      anchor={{ x: 40, y: 50 }}
      label="编辑菜单"
      groups={[
        [{ label: "撤销", disabled: true, onSelect: vi.fn() }, { label: "重做", onSelect: vi.fn() }],
        [{ label: "全选", onSelect: vi.fn() }],
      ]}
      onDismiss={onDismiss}
    />);

    const menu = screen.getByRole("menu", { name: "编辑菜单" });
    const redo = within(menu).getByRole("menuitem", { name: "重做" });
    const selectAll = within(menu).getByRole("menuitem", { name: "全选" });
    await waitFor(() => expect(redo).toHaveFocus());
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(selectAll).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(redo).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(selectAll).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Tab" });
    expect(onDismiss).toHaveBeenLastCalledWith(true);
  });

  it("distinguishes outside-pointer and Escape dismissal", () => {
    const onDismiss = vi.fn();
    render(<><FileTextContextMenu anchor={{ x: 10, y: 10 }} label="预览菜单" groups={[[{ label: "全选", onSelect: vi.fn() }]]} onDismiss={onDismiss}/><button>外部</button></>);

    fireEvent.pointerDown(screen.getByRole("button", { name: "外部" }));
    expect(onDismiss).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenLastCalledWith(true);
  });
});
