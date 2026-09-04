import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
vi.mock("../terminal/TerminalPanel", () => ({ TerminalPanel: () => <div aria-label="SSH 终端"/> }));
vi.mock("../lib/tauri/window", () => ({
  currentDesktopPlatform: () => "windows", isCurrentWindowAlwaysOnTop: async () => false,
  setCurrentWindowAlwaysOnTop: vi.fn(), minimizeCurrentWindow: vi.fn(),
  toggleMaximizeCurrentWindow: vi.fn(), closeCurrentWindow: vi.fn(), startDraggingCurrentWindow: vi.fn(),
}));
afterEach(cleanup);
it("keeps the new-workspace button after the tabs and usable after many creations", async () => {
  render(<App/>);
  const nav = await screen.findByRole("navigation", { name: "工作区" });
  const add = screen.getByRole("button", { name: "新建工作区" });
  expect(nav).toContainElement(add);
  expect(nav.lastElementChild).toBe(add.parentElement);
  for (let index = 0; index < 8; index += 1) fireEvent.click(add);
  expect(within(nav).getByRole("button", { name: "工作区-9" })).toBeInTheDocument();
  expect(add).toBeEnabled();
  expect(nav.lastElementChild).toBe(add.parentElement);
  expect(nav.querySelector(".workspace-tab-strip")).toBeInTheDocument();
  expect(add.closest(".workspace-tab-strip")).toBeNull();
});

it("disables creation at ten workspaces and explains the limit below the action", async () => {
  render(<App/>);
  const nav = await screen.findByRole("navigation", { name: "工作区" });
  const add = screen.getByRole("button", { name: "新建工作区" });
  for (let i = 1; i < 10; i++) fireEvent.click(add);
  expect(add).toBeDisabled();
  fireEvent.click(add);
  fireEvent.keyDown(window, { key: "T", code: "KeyT", ctrlKey: true, shiftKey: true });
  expect(nav.querySelectorAll(".workspace-tab")).toHaveLength(10);
  const anchor = add.parentElement!;
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({ left: 250, right: 280, top: 10, bottom: 40, width: 30, height: 30, x: 250, y: 10, toJSON: () => ({}) });
  fireEvent.pointerEnter(anchor);
  const hint = screen.getByRole("tooltip");
  expect(hint).toHaveTextContent("最多开启 10 个工作区");
  expect(hint).toHaveStyle({ top: "46px" });
  expect(nav).not.toContainElement(hint);
  fireEvent.pointerLeave(anchor);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.focus(anchor);
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
}, 10000);
