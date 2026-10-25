import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebDataPopover } from "./WebDataPopover";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["cancel", "escape"])("restores focus after %s without reopening the lock tooltip", method => {
  render(<WebDataPopover disabled={false} profileName="HOME-220" onClear={vi.fn(async () => {})}/>);
  const trigger = screen.getByRole("button", { name: "清理浏览数据" });
  fireEvent.mouseEnter(trigger);
  expect(screen.getByRole("tooltip")).toBeVisible();
  fireEvent.click(trigger);
  expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  fireEvent.mouseLeave(trigger);
  if (method === "cancel") fireEvent.click(screen.getByRole("button", { name: "取消" }));
  else fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
  expect(trigger).not.toHaveAttribute("aria-describedby");
  expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  fireEvent.mouseEnter(trigger);
  expect(screen.getByRole("tooltip")).toHaveTextContent("清理浏览数据");
  fireEvent.mouseLeave(trigger);
  act(() => trigger.blur());
  act(() => trigger.focus());
  expect(screen.getByRole("tooltip")).toBeVisible();
});

it.each([
  { width: 600, anchorLeft: 180, expectedLeft: "0px", expectedWidth: "300px" },
  { width: 300, anchorLeft: 180, expectedLeft: "-72px", expectedWidth: "284px" },
])("aligns the lock popover to the left and clamps it inside a $width px block", ({ width, anchorLeft, expectedLeft, expectedWidth }) => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("web-block")
      ? new DOMRect(100, 0, width, 500)
      : new DOMRect(anchorLeft, 30, 25, 25);
  });
  render(<div className="web-block"><WebDataPopover disabled={false} profileName="a" onClear={vi.fn(async () => {})}/></div>);
  fireEvent.click(screen.getByRole("button", { name: "清理浏览数据" }));
  expect(screen.getByRole("dialog")).toHaveStyle({ left: expectedLeft, width: expectedWidth });
});
it("summarizes selection and disables clearing when all grouped options are unchecked", () => {
  render(<WebDataPopover disabled={false} profileName="HOME-220" onClear={vi.fn(async () => {})}/>);
  fireEvent.click(screen.getByRole("button", { name: "清理浏览数据" }));
  expect(screen.getByRole("group", { name: "选择清理内容" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("已选 1 项");
  fireEvent.click(screen.getByRole("checkbox", { name: /网页资源缓存/ }));
  expect(screen.getByRole("status")).toHaveTextContent("已选 0 项");
  expect(screen.getByRole("button", { name: "清理" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Cookie/ }));
  expect(screen.getByRole("button", { name: "清理" })).toBeEnabled();
});
it("defaults to cache-only, prevents duplicate clears and reports errors without dismissing", async () => {
  let reject!: (error: Error) => void;
  const clear = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
  render(<WebDataPopover disabled={false} profileName="AI-149" onClear={clear}/>);
  fireEvent.click(screen.getByRole("button", { name: "清理浏览数据" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("所有 block 和标签页");
  fireEvent.click(screen.getByRole("button", { name: "清理" }));
  expect(clear).toHaveBeenCalledWith({ cache: true, cookies: false, storage: false });
  expect(screen.getByRole("button", { name: "清理" })).toBeDisabled();
  fireEvent.keyDown(window, { key: "Escape" }); fireEvent.pointerDown(document.body);
  expect(screen.getByRole("dialog")).toBeVisible();
  await act(async () => reject(new Error("Failed")));
  expect(screen.getByRole("status")).toHaveTextContent("Failed");
  fireEvent.click(screen.getByRole("checkbox", { name: /Cookie/ }));
  fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull();
});
it("dismisses after native guest activation and retains history/bookmarks messaging", () => {
  const props = { disabled: false, profileName: "a", onClear: vi.fn(async () => {}) };
  const view = render(<WebDataPopover {...props} dismissKey={0}/>);
  fireEvent.click(screen.getByRole("button", { name: "清理浏览数据" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("历史记录与收藏保留");
  view.rerender(<WebDataPopover {...props} dismissKey={1}/>);
  expect(screen.queryByRole("dialog")).toBeNull();
});
