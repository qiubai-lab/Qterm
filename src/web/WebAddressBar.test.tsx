import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebAddressBar } from "./WebAddressBar";
import { readCssBundle } from "../test/css";
afterEach(cleanup);
const properties = () => ({ address: "http://localhost/", ready: true, loading: false, disabled: false, connecting: false, bookmarked: false, bookmarkBusy: false, libraryOpen: false, onNavigate: vi.fn(async () => true), onAction: vi.fn(), onBookmark: vi.fn(), onLibrary: vi.fn() });

it("highlights the address editor for its own focus but not cleanup option interactions", () => {
  const css = readCssBundle("src/web/webBlock.css");
  const focusSelector = css.match(/(\.web-address-field[^{}]+)\{[^}]*border-color: var\(--focus\)/)![1].trim();
  render(<WebAddressBar {...properties()} onClearData={vi.fn(async () => {})}/>);
  const input = screen.getByRole("combobox", { name: "网页地址" });
  const field = input.closest(".web-address-field")!;
  act(() => input.focus());
  expect(field.matches(focusSelector)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "清理浏览数据" }));
  for (const checkbox of screen.getAllByRole("checkbox")) {
    act(() => checkbox.focus());
    fireEvent.click(checkbox);
    expect(field.matches(focusSelector)).toBe(false);
  }
  fireEvent.keyDown(window, { key: "Escape" });
  act(() => input.focus());
  expect(field.matches(focusSelector)).toBe(true);
});

it("embeds the cleanup lock before the address and opens its dialog without navigating", () => {
  const props = properties();
  const clear = vi.fn(async () => {});
  render(<WebAddressBar {...props} onClearData={clear}/>);
  const input = screen.getByRole("combobox", { name: "网页地址" });
  const button = screen.getByRole("button", { name: "清理浏览数据" });
  expect(input.previousElementSibling).toContainElement(button);
  expect(button.querySelector('[data-icon="lock"]')).not.toBeNull();
  fireEvent.click(button);
  expect(screen.getByRole("dialog", { name: "清理浏览数据" })).toBeVisible();
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(props.onNavigate).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(button).toHaveFocus();
});

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

it("swaps refresh for Stop without duplicating the tab's loading indicator", () => {
  const props = properties(); const view = render(<WebAddressBar {...props}/>);
  expect(screen.queryByRole("progressbar")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "刷新网页" }));
  expect(props.onAction).toHaveBeenCalledWith("reload");
  view.rerender(<WebAddressBar {...props} loading/>);
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(view.container.querySelector(".web-address-spinner, [data-icon='browser']")).toBeNull();
  expect(screen.queryByRole("button", { name: "刷新网页" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "停止加载" }));
  expect(props.onAction).toHaveBeenLastCalledWith("stop");
  view.rerender(<WebAddressBar {...props}/>);
  expect(screen.getByRole("button", { name: "刷新网页" })).toBeVisible();
});
