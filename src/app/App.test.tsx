import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../terminal/TerminalPanel", () => ({ TerminalPanel: () => <div aria-label="SSH 终端"/> }));
vi.mock("../lib/tauri/window", () => ({
  currentDesktopPlatform: vi.fn(() => "windows"),
  isCurrentWindowAlwaysOnTop: vi.fn(async () => false),
  setCurrentWindowAlwaysOnTop: vi.fn(),
  minimizeCurrentWindow: vi.fn(),
  toggleMaximizeCurrentWindow: vi.fn(),
  closeCurrentWindow: vi.fn(),
  startDraggingCurrentWindow: vi.fn(),
}));

import App from "./App";
import { closeCurrentWindow, currentDesktopPlatform, isCurrentWindowAlwaysOnTop, minimizeCurrentWindow, setCurrentWindowAlwaysOnTop, startDraggingCurrentWindow, toggleMaximizeCurrentWindow } from "../lib/tauri/window";

beforeEach(() => {
  vi.mocked(currentDesktopPlatform).mockReturnValue("windows");
  vi.mocked(isCurrentWindowAlwaysOnTop).mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function mockWorkspaceTabRect(element: HTMLElement, left: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    bottom: 35,
    height: 30,
    left,
    right: left + 128,
    top: 5,
    width: 128,
    x: left,
    y: 5,
    toJSON: () => ({}),
  });
}

describe("application shell", () => {
  it("places Qterm branding left, workspace tabs center, and window controls right", async () => {
    const user = userEvent.setup();
    render(<App/>);

    const brand = screen.getByLabelText("Qterm");
    const controls = screen.getByLabelText("窗口控制");
    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
    expect(brand).toHaveTextContent("Qterm");
    expect(brand.querySelector("svg")).toBeInTheDocument();
    expect(brand.nextElementSibling).toBe(workspaceNavigation);
    expect(workspaceNavigation.nextElementSibling).toBe(controls);
    expect(within(controls).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["置顶窗口", "最小化窗口", "最大化或还原窗口", "关闭窗口"]);
    expect(within(controls).getByRole("button", { name: "置顶窗口" }).querySelector('[data-icon="pin"]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭窗口" }));
    await user.click(screen.getByRole("button", { name: "最小化窗口" }));
    await user.click(screen.getByRole("button", { name: "最大化或还原窗口" }));

    expect(closeCurrentWindow).toHaveBeenCalledOnce();
    expect(minimizeCurrentWindow).toHaveBeenCalledOnce();
    expect(toggleMaximizeCurrentWindow).toHaveBeenCalledOnce();
  });

  it("uses the macOS native titlebar controls with only the shared pin action on the right", () => {
    vi.mocked(currentDesktopPlatform).mockReturnValue("macos");
    render(<App/>);

    const shell = screen.getByRole("main");
    const brand = screen.getByLabelText("Qterm");
    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
    expect(shell).toHaveAttribute("data-platform", "macos");
    const controls = screen.getByLabelText("窗口控制");
    expect(within(controls).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["置顶窗口"]);
    expect(brand.nextElementSibling).toBe(workspaceNavigation);
    expect(workspaceNavigation.nextElementSibling).toBe(controls);
  });

  it("toggles the window always-on-top state and exposes the active state", async () => {
    const user = userEvent.setup();
    render(<App/>);

    const pin = await screen.findByRole("button", { name: "置顶窗口" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await user.click(pin);
    expect(setCurrentWindowAlwaysOnTop).toHaveBeenLastCalledWith(true);

    const activePin = screen.getByRole("button", { name: "取消窗口置顶" });
    expect(activePin).toHaveAttribute("aria-pressed", "true");
    await user.click(activePin);
    expect(setCurrentWindowAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "置顶窗口" })).toHaveAttribute("aria-pressed", "false");
  });

  it("starts window dragging only after non-interactive titlebar space moves beyond the click threshold", () => {
    render(<App/>);

    const brand = screen.getByLabelText("Qterm");
    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
    fireEvent.pointerDown(brand, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 12, clientY: 12, buttons: 1 });
    expect(startDraggingCurrentWindow).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 16, clientY: 10, buttons: 1 });
    expect(startDraggingCurrentWindow).toHaveBeenCalledOnce();

    fireEvent.pointerDown(workspaceNavigation, { button: 0, pointerId: 2, clientX: 100, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 106, clientY: 10, buttons: 1 });
    expect(startDraggingCurrentWindow).toHaveBeenCalledTimes(2);

    vi.mocked(startDraggingCurrentWindow).mockClear();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Workspace 1" }), { button: 0, pointerId: 3, clientX: 20, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 30, clientY: 10, buttons: 1 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "关闭窗口" }), { button: 0, pointerId: 4, clientX: 200, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 210, clientY: 10, buttons: 1 });
    expect(startDraggingCurrentWindow).not.toHaveBeenCalled();
  });

  it("toggles maximize and restore from two stationary titlebar clicks without relying on native dblclick delivery", () => {
    vi.useFakeTimers();
    render(<App/>);

    const chrome = document.querySelector<HTMLElement>(".app-chrome")!;
    fireEvent.pointerDown(chrome, { button: 0, pointerId: 1, clientX: 300, clientY: 20, detail: 0 });
    fireEvent.pointerUp(window, { button: 0, pointerId: 1, clientX: 300, clientY: 20, detail: 0 });
    vi.advanceTimersByTime(120);
    fireEvent.pointerDown(chrome, { button: 0, pointerId: 2, clientX: 301, clientY: 20, detail: 0 });

    expect(startDraggingCurrentWindow).not.toHaveBeenCalled();
    expect(toggleMaximizeCurrentWindow).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(400);
    fireEvent.pointerDown(chrome, { button: 0, pointerId: 3, clientX: 300, clientY: 20, detail: 0 });
    fireEvent.pointerUp(window, { button: 0, pointerId: 3, clientX: 300, clientY: 20, detail: 0 });
    vi.advanceTimersByTime(120);
    fireEvent.pointerDown(chrome, { button: 0, pointerId: 4, clientX: 299, clientY: 20, detail: 0 });
    expect(toggleMaximizeCurrentWindow).toHaveBeenCalledTimes(2);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Workspace 1" }), { button: 0, pointerId: 5, clientX: 20, clientY: 20, detail: 0 });
    fireEvent.pointerUp(window, { button: 0, pointerId: 5, clientX: 20, clientY: 20, detail: 0 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Workspace 1" }), { button: 0, pointerId: 6, clientX: 20, clientY: 20, detail: 0 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "最大化或还原窗口" }), { button: 0, pointerId: 7, clientX: 600, clientY: 20, detail: 0 });
    expect(toggleMaximizeCurrentWindow).toHaveBeenCalledTimes(2);
  });

  it("uses top-level workspace tabs without nested terminal tabs", async () => {
    const user = userEvent.setup();
    render(<App/>);

    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
    expect(workspaceNavigation.querySelectorAll(".workspace-tab-selection")).toHaveLength(1);
    expect(workspaceNavigation.querySelector(".workspace-tab-selection")).toHaveAttribute("aria-hidden", "true");
    expect(within(workspaceNavigation).getByRole("button", { name: "Workspace 1" })).toBeInTheDocument();
    expect(within(workspaceNavigation).getByRole("button", { name: "新建工作区" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "当前工作区标签页" })).not.toBeInTheDocument();

    await user.click(within(workspaceNavigation).getByRole("button", { name: "新建工作区" }));
    expect(within(workspaceNavigation).getByRole("button", { name: "Workspace 2" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("SSH 终端")).toHaveLength(2);
    expect(screen.getByRole("complementary", { name: "工具" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "文件管理" }));
    expect(screen.getByRole("region", { name: /文件窗口/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /选择文件连接，当前：本机文件/ })).toBeInTheDocument();
  });

  it("switches back and forth between workspace tabs after creating one", async () => {
    const user = userEvent.setup();
    render(<App/>);

    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
    const workspace1 = within(workspaceNavigation).getByRole("button", { name: "Workspace 1" });

    await user.click(within(workspaceNavigation).getByRole("button", { name: "新建工作区" }));
    const workspace2 = within(workspaceNavigation).getByRole("button", { name: "Workspace 2" });
    const stages = screen.getAllByLabelText("SSH 终端").map((terminal) => terminal.closest(".workspace-canvas-stage"));

    expect(workspace2.closest(".workspace-tab")).toHaveClass("selected");
    expect(stages[0]).toHaveAttribute("aria-hidden", "true");
    expect(stages[1]).toHaveAttribute("aria-hidden", "false");
    expect(stages[1]).toHaveClass("workspace-transition-forward");

    await user.click(workspace1);
    expect(workspace1.closest(".workspace-tab")).toHaveClass("selected");
    expect(stages[0]).toHaveAttribute("aria-hidden", "false");
    expect(stages[1]).toHaveAttribute("aria-hidden", "true");
    expect(stages[0]).toHaveClass("workspace-transition-backward");

    await user.click(workspace2);
    expect(workspace2.closest(".workspace-tab")).toHaveClass("selected");
    expect(stages[0]).toHaveAttribute("aria-hidden", "true");
    expect(stages[1]).toHaveAttribute("aria-hidden", "false");
    expect(stages[1]).toHaveClass("workspace-transition-forward");
  });

  it("starts workspace tab dragging only after clear horizontal intent and shows live drop feedback", async () => {
    const user = userEvent.setup();
    render(<App/>);

    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
    await user.click(within(workspaceNavigation).getByRole("button", { name: "新建工作区" }));
    await user.click(within(workspaceNavigation).getByRole("button", { name: "新建工作区" }));
    const workspace1 = within(workspaceNavigation).getByRole("button", { name: "Workspace 1" });
    const workspace2 = within(workspaceNavigation).getByRole("button", { name: "Workspace 2" });
    const workspace3 = within(workspaceNavigation).getByRole("button", { name: "Workspace 3" });
    const workspace1Tab = workspace1.closest<HTMLElement>(".workspace-tab")!;
    const workspace2Tab = workspace2.closest<HTMLElement>(".workspace-tab")!;
    const workspace3Tab = workspace3.closest<HTMLElement>(".workspace-tab")!;
    mockWorkspaceTabRect(workspace1Tab, 0);
    mockWorkspaceTabRect(workspace2Tab, 131);
    mockWorkspaceTabRect(workspace3Tab, 262);

    fireEvent.pointerDown(workspace1, { button: 0, pointerId: 11, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 28, clientY: 21, buttons: 1 });
    expect(workspace1Tab).not.toHaveClass("dragging");
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 25, clientY: 33, buttons: 1 });
    expect(workspace1Tab).not.toHaveClass("dragging");
    fireEvent.pointerCancel(window, { pointerId: 11 });

    fireEvent.pointerDown(workspace1, { button: 0, pointerId: 12, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 12, clientX: 34, clientY: 22, buttons: 1 });
    expect(workspace1Tab).toHaveClass("dragging");
    expect(workspace1Tab.style.getPropertyValue("--workspace-tab-drag-x")).toBe("14px");
    expect(workspaceNavigation.querySelector("[data-drop-shift]")).toBeNull();

    fireEvent.pointerMove(window, { pointerId: 12, clientX: 220, clientY: 22, buttons: 1 });
    expect(workspace1Tab.style.getPropertyValue("--workspace-tab-drag-x")).toBe("200px");
    expect(workspace2Tab).toHaveAttribute("data-drop-shift", "left");
    expect(workspace3Tab).toHaveAttribute("data-drop-shift", "left");
    expect(workspace3Tab).toHaveClass("drop-target");
    expect(workspace2Tab).not.toHaveClass("drop-target");

    fireEvent.pointerCancel(window, { pointerId: 12 });
    expect(workspace1Tab).not.toHaveClass("dragging");
    expect(workspace1Tab.style.getPropertyValue("--workspace-tab-drag-x")).toBe("");
    expect(workspace2Tab).not.toHaveAttribute("data-drop-shift");
    expect(workspace3Tab).not.toHaveAttribute("data-drop-shift");
    expect(workspace3Tab).toHaveClass("selected");
  });

  it("reorders and selects a non-active workspace on drop without entering rename from generated clicks", async () => {
    const user = userEvent.setup();
    render(<App/>);

    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
    await user.click(within(workspaceNavigation).getByRole("button", { name: "新建工作区" }));
    const workspace1 = within(workspaceNavigation).getByRole("button", { name: "Workspace 1" });
    const workspace2 = within(workspaceNavigation).getByRole("button", { name: "Workspace 2" });
    const workspace1Tab = workspace1.closest<HTMLElement>(".workspace-tab")!;
    const workspace2Tab = workspace2.closest<HTMLElement>(".workspace-tab")!;
    const workspace1Stage = screen.getAllByLabelText("SSH 终端")[0].closest<HTMLElement>(".workspace-canvas-stage")!;
    const workspace2Stage = screen.getAllByLabelText("SSH 终端")[1].closest<HTMLElement>(".workspace-canvas-stage")!;
    mockWorkspaceTabRect(workspace1Tab, 0);
    mockWorkspaceTabRect(workspace2Tab, 131);

    fireEvent.pointerDown(workspace1, { button: 0, pointerId: 13, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 13, clientX: 90, clientY: 21, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 13, clientX: 90, clientY: 21 });
    expect(workspaceNavigation).toHaveClass("drop-settling");
    fireEvent.click(workspace1);
    fireEvent.doubleClick(workspace1);

    expect(Array.from(workspaceNavigation.querySelectorAll(".workspace-tab-select span"), (label) => label.textContent)).toEqual(["Workspace 2", "Workspace 1"]);
    expect(workspace1Tab).toHaveClass("selected");
    expect(workspace2Tab).not.toHaveClass("selected");
    expect(workspace1Stage).toHaveAttribute("aria-hidden", "false");
    expect(workspace1Stage).toHaveClass("workspace-transition-forward");
    expect(workspace2Stage).toHaveAttribute("aria-hidden", "true");
    expect(within(workspaceNavigation).queryByRole("textbox", { name: "重命名 Workspace 1" })).not.toBeInTheDocument();
    expect(workspaceNavigation.querySelector(".workspace-tab.dragging")).toBeNull();
    expect(workspaceNavigation.querySelector("[data-drop-shift]")).toBeNull();
  });

  it("edits a workspace name inside its existing tab", async () => {
    const user = userEvent.setup();
    render(<App/>);

    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
    await user.click(within(workspaceNavigation).getByRole("button", { name: "新建工作区" }));
    const workspaceName = within(workspaceNavigation).getByRole("button", { name: "Workspace 1" });
    const workspaceTab = workspaceName.closest(".workspace-tab");
    expect(workspaceTab).not.toBeNull();

    await user.dblClick(workspaceName);

    const renameInput = within(workspaceNavigation).getByRole("textbox", { name: "重命名 Workspace 1" });
    expect(renameInput.closest(".workspace-tab")).toBe(workspaceTab);
    expect(renameInput.parentElement).toHaveClass("workspace-tab-rename");
    expect(renameInput.parentElement?.querySelector("svg")).toBeInTheDocument();
    expect(within(workspaceTab as HTMLElement).getByRole("button", { name: "关闭 Workspace 1" })).toBeInTheDocument();

    await user.clear(renameInput);
    await user.type(renameInput, "Production{Enter}");
    expect(within(workspaceNavigation).getByRole("button", { name: "Production" })).toBeInTheDocument();
  });
});
