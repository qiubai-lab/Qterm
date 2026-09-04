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
  for (let index = 0; index < 12; index += 1) fireEvent.click(add);
  expect(within(nav).getByRole("button", { name: "工作区-13" })).toBeInTheDocument();
  expect(add).toBeEnabled();
  expect(nav.lastElementChild).toBe(add.parentElement);
  expect(add.parentElement?.previousElementSibling).toHaveAttribute("data-workspace-id");
});
