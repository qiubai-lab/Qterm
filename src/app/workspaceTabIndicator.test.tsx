import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
vi.mock("../terminal/TerminalPanel", () => ({ TerminalPanel: () => <div aria-label="SSH 终端"/> }));
vi.mock("../lib/tauri/window", () => ({
  currentDesktopPlatform: () => "windows", isCurrentWindowAlwaysOnTop: async () => false,
  setCurrentWindowAlwaysOnTop: vi.fn(), minimizeCurrentWindow: vi.fn(),
  toggleMaximizeCurrentWindow: vi.fn(), closeCurrentWindow: vi.fn(), startDraggingCurrentWindow: vi.fn(),
}));
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function(this: HTMLElement) {
    return this.classList.contains("workspace-tab") ? [...this.parentElement!.querySelectorAll(".workspace-tab")].indexOf(this) * 131 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("workspace-tab") ? 128 : 0; });
  // Simulate a CSS transform still carrying the previous deck/drop position.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    return new DOMRect(this.offsetLeft + (this.classList.contains("workspace-tab") ? 400 : 0), 0, this.offsetWidth, 30);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("follows the selected tab's layout after batch closing preceding tabs, ignoring animation transforms", async () => {
  render(<App/>);
  const nav = await screen.findByRole("navigation", { name: "工作区" });
  for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: "新建工作区" }));
  fireEvent.contextMenu(screen.getByRole("button", { name: "工作区-3" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "关闭左侧工作区" }));
  fireEvent.click(screen.getByRole("button", { name: "关闭 2 个工作区" }));
  await waitFor(() => expect(nav.querySelectorAll(".workspace-tab")).toHaveLength(1));
  expect((nav.querySelector(".workspace-tab-selection") as HTMLElement).style.transform).toBe("translate3d(0px, 0, 0)");
  expect((nav.querySelector(".workspace-tab-selection") as HTMLElement).style.width).toBe("128px");
});
it("uses stable layout coordinates on selection, single close and resize", async () => {
  render(<App/>);
  const nav = await screen.findByRole("navigation", { name: "工作区" });
  for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: "新建工作区" }));
  const indicator = nav.querySelector(".workspace-tab-selection") as HTMLElement;
  expect(indicator.style.transform).toBe("translate3d(262px, 0, 0)");
  fireEvent.click(screen.getByRole("button", { name: "关闭 工作区-1" }));
  await waitFor(() => expect(indicator.style.transform).toBe("translate3d(131px, 0, 0)"));
  fireEvent.click(screen.getByRole("button", { name: "工作区-2" }));
  fireEvent(window, new Event("resize"));
  expect(indicator.style.transform).toBe("translate3d(0px, 0, 0)");
});
