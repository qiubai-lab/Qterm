import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebDataPopover } from "./WebDataPopover";

afterEach(cleanup);
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
