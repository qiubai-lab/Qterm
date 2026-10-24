import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebAddressBar } from "./WebAddressBar";
afterEach(cleanup);
const properties = () => ({ address: "http://localhost/", ready: true, loading: false, disabled: false, connecting: false, bookmarked: false, bookmarkBusy: false, libraryOpen: false, onNavigate: vi.fn(async () => true), onAction: vi.fn(), onBookmark: vi.fn(), onLibrary: vi.fn() });

it("uses form Enter submission without an open button and suppresses IME composition", async () => {
  const props = properties(); render(<WebAddressBar {...props}/>);
  const input = screen.getByRole("combobox", { name: "网页地址" });
  expect(screen.queryByRole("button", { name: "打开" })).toBeNull();
  fireEvent.change(input, { target: { value: "http://new.internal/" } });
  fireEvent.compositionStart(input);
  fireEvent.submit(input.closest("form")!);
  expect(props.onNavigate).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(props.onNavigate).toHaveBeenCalledWith("http://new.internal/"));
});

it("tracks routes while preserving a draft until Escape or blur and never discards later typing", async () => {
  const props = properties();
  let finish!: (valid: boolean) => void;
  props.onNavigate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<WebAddressBar {...props}/>);
  const input = screen.getByRole("combobox", { name: "网页地址" });
  view.rerender(<WebAddressBar {...props} address="http://localhost/dashboard"/>);
  expect(input).toHaveValue("http://localhost/dashboard");
  fireEvent.change(input, { target: { value: "http://draft/" } });
  view.rerender(<WebAddressBar {...props} address="http://localhost/route#hash"/>);
  expect(input).toHaveValue("http://draft/");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveValue("http://localhost/route#hash");
  fireEvent.change(input, { target: { value: "http://submitted/" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.change(input, { target: { value: "http://new-draft/" } });
  await act(async () => finish(true));
  expect(input).toHaveValue("http://new-draft/");
  fireEvent.blur(input);
  expect(input).toHaveValue("http://localhost/route#hash");
});

it("swaps refresh for Stop and removes loading feedback without closing the page", () => {
  const props = properties(); const view = render(<WebAddressBar {...props}/>);
  expect(screen.queryByRole("progressbar")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "刷新网页" }));
  expect(props.onAction).toHaveBeenCalledWith("reload");
  view.rerender(<WebAddressBar {...props} loading/>);
  expect(screen.getByRole("progressbar", { name: "网页加载中" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "刷新网页" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "停止加载" }));
  expect(props.onAction).toHaveBeenLastCalledWith("stop");
  view.rerender(<WebAddressBar {...props}/>);
  expect(screen.getByRole("button", { name: "刷新网页" })).toBeVisible();
});
