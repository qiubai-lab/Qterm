import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebLibraryDialog } from "./WebLibraryDialog";
import type { WebLibrary } from "../lib/tauri/webLibrary";

afterEach(cleanup);
const entry = { profileId: "a", url: "http://localhost:3000/", title: "Dashboard", updatedAt: 1 };
const data: WebLibrary = { history: [entry, { ...entry, url: "https://docs.internal/", title: "Documentation" }], bookmarks: [entry] };
function setup() {
  const props = { profileName: "AI-149", data, busy: false, error: "", onUpdate: vi.fn(async () => true), onOpen: vi.fn(), onClose: vi.fn() };
  render(<WebLibraryDialog {...props}/>);
  return props;
}

it("searches and reopens records, exposes favorite state and renames bookmarks", async () => {
  const props = setup();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "localhost" } });
  expect(screen.queryByRole("button", { name: "打开 Documentation" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "打开 Dashboard" }));
  expect(props.onOpen).toHaveBeenCalledWith(entry.url);
  expect(screen.getByRole("button", { name: "取消收藏 Dashboard" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("tab", { name: /收藏/ }));
  fireEvent.click(screen.getByRole("button", { name: "重命名 Dashboard" }));
  fireEvent.change(screen.getByRole("textbox", { name: "收藏名称" }), { target: { value: "My dashboard" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith({ kind: "bookmark", url: entry.url, title: "My dashboard" }));
});

it("confirms history deletion and Escape closes only the nested confirmation", async () => {
  const props = setup();
  fireEvent.click(screen.getByRole("button", { name: "清空历史" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(2);
  expect(screen.getAllByRole("dialog")[0].parentElement).not.toHaveClass("dialog-scrim-blocking");
  expect(props.onUpdate).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(props.onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "删除记录 Dashboard" }));
  fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
  await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
  expect(props.onUpdate).toHaveBeenCalledWith({ kind: "removeVisit", url: entry.url });
});

it("shows empty and failed states with a retry and supports keyboard tab switching", () => {
  const update = vi.fn(async () => true);
  render(<WebLibraryDialog profileName="Empty" data={{ history: [], bookmarks: [] }} busy={false} error="Cannot save" onUpdate={update} onOpen={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.getByText("暂时无法读取记录")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Cannot save");
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(update).toHaveBeenCalledWith();
  fireEvent.keyDown(screen.getByRole("tab", { name: /历史/ }), { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: /收藏/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("暂时无法读取记录")).toBeVisible();
});

it("puts search before the compact history tabs and bookmarks the displayed page title", () => {
  const props = setup();
  const search = screen.getByRole("searchbox");
  const tabs = screen.getByRole("tablist");
  expect(search.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("tab", { name: /历史/ })).not.toHaveTextContent("访问历史");
  fireEvent.click(screen.getByRole("button", { name: "收藏 Documentation" }));
  expect(props.onUpdate).toHaveBeenCalledWith({ kind: "bookmark", url: "https://docs.internal/", title: "Documentation" });
});
