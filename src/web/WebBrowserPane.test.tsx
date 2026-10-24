import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebBrowserPane } from "./WebBrowserPane";
const mocks = vi.hoisted(() => ({ update: vi.fn(async () => true), navigate: vi.fn(async () => true), visit: vi.fn(), ready: true }));
vi.mock("./useWebBrowser", () => ({ useWebBrowser: () => ({ address: "http://localhost:3000/", title: "本地控制台", ready: mocks.ready, error: "", loading: false, navigate: mocks.navigate, action: vi.fn() }) }));
vi.mock("./useWebLibrary", () => ({ useWebLibrary: () => ({ data: { history: [{ profileId: "a", url: "https://docs.internal/", title: "Docs", updatedAt: 1 }], bookmarks: [] }, busy: false, error: "", update: mocks.update, record: mocks.visit }) }));
afterEach(cleanup);

it("bookmarks the current address and reopens history through authentication when disconnected", async () => {
  const connect = vi.fn();
  const props = { profileId: "a", profileName: "Jump target", sessionId: "ssh" as string | null, connecting: false, visible: true, supported: true, notice: "", onConnect: connect, onActivate: vi.fn() };
  const view = render(<WebBrowserPane {...props}/>);
  expect(view.container.querySelector(".web-browser-surface")?.nextElementSibling).toHaveClass("web-feedback");
  fireEvent.change(screen.getByRole("combobox", { name: "网页地址" }), { target: { value: "http://draft.internal/" } });
  fireEvent.click(screen.getByRole("button", { name: "收藏当前网页" }));
  expect(mocks.update).toHaveBeenCalledWith({ kind: "bookmark", url: "http://localhost:3000/", title: "本地控制台" });
  mocks.ready = false;
  view.rerender(<WebBrowserPane {...props} sessionId={null}/>);
  fireEvent.click(screen.getByRole("button", { name: "访问历史与收藏" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Jump target");
  fireEvent.click(screen.getByRole("button", { name: "打开 Docs" }));
  await waitFor(() => expect(connect).toHaveBeenCalledOnce());
  expect(mocks.navigate).toHaveBeenCalledWith("https://docs.internal/");
  expect(screen.queryByRole("dialog")).toBeNull();
});


it("opens the full history dialog from the recent-address dropdown", () => {
  render(<WebBrowserPane profileId="a" profileName="Jump target" sessionId="ssh" connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/>);
  fireEvent.focus(screen.getByRole("combobox", { name: "网页地址" }));
  expect(screen.getByRole("listbox")).toHaveTextContent("Docs");
  fireEvent.click(screen.getByRole("option", { name: "更多历史记录" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Jump target");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.getByRole("tabpanel").parentElement).toHaveClass("overlay-scroll-area");
});
