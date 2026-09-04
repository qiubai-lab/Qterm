import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
vi.mock("../terminal/TerminalPanel", () => ({ TerminalPanel: () => <div aria-label="SSH 终端"/> }));
vi.mock("../lib/tauri/window", () => ({
  currentDesktopPlatform: () => "windows", isCurrentWindowAlwaysOnTop: async () => false,
  setCurrentWindowAlwaysOnTop: vi.fn(), minimizeCurrentWindow: vi.fn(),
  toggleMaximizeCurrentWindow: vi.fn(), closeCurrentWindow: vi.fn(), startDraggingCurrentWindow: vi.fn(),
}));
let width = 480;
beforeEach(() => {
  width = 480;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("workspace-tab-strip") ? width : 0; });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, "scrollTo"); });
async function setup() {
  render(<App/>);
  const nav = await screen.findByRole("navigation", { name: "工作区" });
  for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "新建工作区" }));
  const select = (number: number) => within(nav).getByRole("button", { name: `工作区-${number}` });
  const tab = (number: number) => select(number).closest(".workspace-tab")!;
  return { nav, select, tab };
}
it("expands a preview without selecting it and retains the selected card (AC-002)", async () => {
  const { nav, select, tab } = await setup();
  expect(nav).toHaveAttribute("data-stacked", "true");
  expect(tab(7)).toHaveAttribute("data-expanded");
  expect(within(nav).queryByRole("button", { name: "关闭 工作区-2" })).not.toBeInTheDocument();
  fireEvent.pointerMove(select(2), { clientX: 80, clientY: 16, pointerType: "mouse" });
  expect(tab(2)).toHaveAttribute("data-expanded");
  expect(tab(2)).not.toHaveClass("selected");
  expect(tab(7)).toHaveAttribute("data-expanded");
  fireEvent.pointerLeave(nav);
  expect(tab(2)).not.toHaveAttribute("data-expanded");
  fireEvent.pointerMove(select(2), { clientX: 80, clientY: 16, pointerType: "mouse" });
  expect(tab(2)).toHaveAttribute("data-expanded");
  fireEvent.click(select(2));
  expect(tab(2)).toHaveClass("selected");
  expect(tab(2)).toHaveAttribute("data-expanded");
});
it("does not change preview because an element moves below a stationary pointer (AC-002)", async () => {
  const { select, tab } = await setup();
  fireEvent.pointerMove(select(2), { clientX: 80, clientY: 16, pointerType: "mouse" });
  fireEvent.pointerMove(select(3), { clientX: 80, clientY: 16, pointerType: "mouse" });
  expect(tab(2)).toHaveAttribute("data-expanded");
  expect(tab(3)).not.toHaveAttribute("data-expanded");
});
it("pins a context menu's anchor and keeps batch confirmation (AC-003)", async () => {
  const { nav, select, tab } = await setup();
  fireEvent.contextMenu(select(2), { clientX: 80, clientY: 16 });
  expect(tab(2)).toHaveAttribute("data-expanded");
  fireEvent.pointerLeave(nav);
  expect(tab(2)).toHaveAttribute("data-expanded");
  fireEvent.click(screen.getByRole("menuitem", { name: "关闭右侧工作区" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(tab(2)).toHaveAttribute("data-expanded");
});
it("keeps rename editable and restores flat tabs on resize (AC-001, AC-003)", async () => {
  const { nav, select, tab } = await setup();
  fireEvent.doubleClick(select(2));
  expect(screen.getByRole("textbox", { name: "重命名 工作区-2" })).toHaveFocus();
  expect(tab(7)).toHaveAttribute("data-expanded");
  fireEvent.keyDown(screen.getByRole("textbox", { name: "重命名 工作区-2" }), { key: "Escape" });
  width = 1200;
  fireEvent(window, new Event("resize"));
  await waitFor(() => expect(nav).not.toHaveAttribute("data-stacked"));
  expect(within(nav).getAllByRole("button", { name: /^关闭 工作区-/ })).toHaveLength(7);
});
