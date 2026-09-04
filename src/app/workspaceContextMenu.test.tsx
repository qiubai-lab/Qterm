import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
vi.mock("../terminal/TerminalPanel", () => ({ TerminalPanel: () => <div aria-label="SSH 终端"/> }));
vi.mock("../lib/tauri/window", () => ({
  currentDesktopPlatform: () => "windows",
  isCurrentWindowAlwaysOnTop: async () => false,
  setCurrentWindowAlwaysOnTop: vi.fn(), minimizeCurrentWindow: vi.fn(), toggleMaximizeWindow: vi.fn(),
  toggleMaximizeCurrentWindow: vi.fn(), closeCurrentWindow: vi.fn(), startDraggingCurrentWindow: vi.fn(),
}));
afterEach(cleanup);
it("closes other workspaces with one confirmation through the real shell and reducer", async () => {
  render(<App/>);
  const nav = await screen.findByRole("navigation", { name: "工作区" });
  fireEvent.click(screen.getByRole("button", { name: "新建工作区" }));
  fireEvent.click(screen.getByRole("button", { name: "新建工作区" }));
  const anchor = within(nav).getByRole("button", { name: "工作区-2" });
  fireEvent.contextMenu(anchor, { clientX: 100, clientY: 20 });
  expect(within(nav).getByRole("button", { name: "工作区-3" }).closest(".workspace-tab")).toHaveClass("selected");
  fireEvent.click(screen.getByRole("menuitem", { name: "关闭其他工作区" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.keyDown(window, { key: "t", ctrlKey: true, shiftKey: true });
  expect(within(nav).queryByRole("button", { name: "工作区-4" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "关闭 2 个工作区" }));
  await waitFor(() => expect(within(nav).queryByRole("button", { name: "工作区-1" })).not.toBeInTheDocument());
  expect(within(nav).queryByRole("button", { name: "工作区-3" })).not.toBeInTheDocument();
  expect(anchor.closest(".workspace-tab")).toHaveClass("selected");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
