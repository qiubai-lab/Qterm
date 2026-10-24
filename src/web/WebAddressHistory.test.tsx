import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebAddressBar } from "./WebAddressBar";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const history = Array.from({ length: 8 }, (_, i) => ({ profileId: "a", title: `Page ${i}`, url: `http://host/${i}`, updatedAt: i }));
function setup(entries = history) {
  const props = { history: entries, address: "http://host/", ready: true, loading: false, disabled: false, connecting: false, bookmarked: false, bookmarkBusy: false, libraryOpen: false, onNavigate: vi.fn(async () => true), onAction: vi.fn(), onBookmark: vi.fn(), onLibrary: vi.fn() };
  const view = render(<WebAddressBar {...props}/>);
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  return { props, input, view };
}

it("shows only the five most recent visits and opens a selected URL without losing the click to blur", async () => {
  const { input, props } = setup();
  expect(input).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByRole("option")).toHaveLength(6);
  expect(screen.queryByText("Page 2")).toBeNull();
  const first = screen.getAllByRole("option")[0];
  expect(first).toHaveTextContent("Page 7");
  expect(fireEvent.pointerDown(first)).toBe(false);
  fireEvent.click(first);
  await waitFor(() => expect(props.onNavigate).toHaveBeenCalledWith("http://host/7"));
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("supports arrows, Enter, Escape and the more-history action without submitting a stale draft", () => {
  const { input, props } = setup();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onNavigate).toHaveBeenCalledWith("http://host/7");
  fireEvent.click(input);
  fireEvent.keyDown(input, { key: "ArrowUp" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onLibrary).toHaveBeenCalledOnce();
  fireEvent.click(input);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.click(input);
  fireEvent.blur(input);
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("keeps the full-history entry available when empty and closes before opening the modal", () => {
  const { props } = setup([]);
  expect(screen.getByText("暂无访问历史")).toBeVisible();
  fireEvent.click(screen.getByRole("option", { name: "更多历史记录" }));
  expect(props.onLibrary).toHaveBeenCalledOnce();
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("dismisses the portal when its workspace is hidden", () => {
  const { props, view } = setup();
  view.rerender(<WebAddressBar {...props} visible={false}/>);
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("retains the closing surface, ignores its actions, and cancels disposal on rapid reopen", () => {
  vi.useFakeTimers();
  const { input, props } = setup();
  const panel = screen.getByRole("listbox");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(panel).toBeInTheDocument();
  expect(panel).toHaveAttribute("data-open", "false");
  fireEvent.click(panel.querySelector("button")!);
  expect(props.onNavigate).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(60));
  fireEvent.click(input);
  expect(screen.getByRole("listbox")).toBe(panel);
  act(() => vi.advanceTimersByTime(150));
  expect(panel).toBeInTheDocument();
  fireEvent.blur(input);
  act(() => vi.advanceTimersByTime(130));
  expect(panel).not.toBeInTheDocument();
});

it("disposes immediately under reduced motion and when a workspace is hidden mid-exit", () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  const { input, view, props } = setup();
  const panel = screen.getByRole("listbox");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(panel).not.toBeInTheDocument();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  fireEvent.click(input);
  const next = screen.getByRole("listbox");
  fireEvent.blur(input);
  expect(next).toBeInTheDocument();
  view.rerender(<WebAddressBar {...props} visible={false}/>);
  expect(next).not.toBeInTheDocument();
});

it("loads another batch near the bottom and resets the list on reopening", () => {
  const entries = Array.from({ length: 14 }, (_, i) => ({ ...history[0], title: `Page ${i}`, url: `http://host/${i}`, updatedAt: i }));
  const { input } = setup(entries);
  const viewport = document.querySelector<HTMLDivElement>(".web-address-history-list")!;
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, value: 196 },
    scrollHeight: { configurable: true, value: 196 },
  });
  expect(screen.getAllByRole("option")).toHaveLength(6);
  fireEvent.wheel(viewport, { deltaY: -100 });
  expect(screen.getAllByRole("option")).toHaveLength(6);
  fireEvent.wheel(viewport, { deltaY: 100 });
  expect(screen.getAllByRole("option")).toHaveLength(11);
  Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 386 });
  viewport.scrollTop = 20;
  fireEvent.scroll(viewport);
  expect(screen.getAllByRole("option")).toHaveLength(11);
  viewport.scrollTop = 190;
  fireEvent.scroll(viewport);
  expect(screen.getAllByRole("option")).toHaveLength(15);
  fireEvent.wheel(viewport, { deltaY: 100 });
  expect(screen.getAllByRole("option")).toHaveLength(15);
  expect(screen.getByRole("option", { name: "更多历史记录" })).toBeVisible();
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.click(input);
  expect(screen.getAllByRole("option")).toHaveLength(6);
  expect(viewport.scrollTop).toBe(0);
  // Browsers emit a scroll event after the reopen reset; it must not load a batch.
  fireEvent.scroll(viewport);
  expect(screen.getAllByRole("option")).toHaveLength(6);
});

it("extends the rendered batch when keyboard selection reaches the sixth visit", () => {
  const { input, props } = setup();
  for (let i = 0; i < 6; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getAllByRole("option")).toHaveLength(9);
  expect(screen.getByRole("option", { name: /Page 2/ })).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onNavigate).toHaveBeenCalledWith("http://host/2");
  expect(props.onLibrary).not.toHaveBeenCalled();
});
