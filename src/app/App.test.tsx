import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../terminal/TerminalPanel", () => ({ TerminalPanel: () => <div aria-label="SSH 终端"/> }));
vi.mock("../lib/tauri/window", () => ({
  minimizeCurrentWindow: vi.fn(),
  toggleMaximizeCurrentWindow: vi.fn(),
  closeCurrentWindow: vi.fn(),
  startDraggingCurrentWindow: vi.fn(),
}));

import App from "./App";
import { closeCurrentWindow, minimizeCurrentWindow, startDraggingCurrentWindow, toggleMaximizeCurrentWindow } from "../lib/tauri/window";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
    expect(within(controls).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["最小化窗口", "最大化或还原窗口", "关闭窗口"]);

    await user.click(screen.getByRole("button", { name: "关闭窗口" }));
    await user.click(screen.getByRole("button", { name: "最小化窗口" }));
    await user.click(screen.getByRole("button", { name: "最大化或还原窗口" }));

    expect(closeCurrentWindow).toHaveBeenCalledOnce();
    expect(minimizeCurrentWindow).toHaveBeenCalledOnce();
    expect(toggleMaximizeCurrentWindow).toHaveBeenCalledOnce();
  });

  it("starts window dragging only from non-interactive titlebar space", () => {
    render(<App/>);

    const brand = screen.getByLabelText("Qterm");
    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
    fireEvent.pointerDown(brand, { button: 0, pointerId: 1 });
    fireEvent.pointerDown(workspaceNavigation, { button: 0, pointerId: 1 });
    expect(startDraggingCurrentWindow).toHaveBeenCalledTimes(2);

    vi.mocked(startDraggingCurrentWindow).mockClear();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Workspace 1" }), { button: 0, pointerId: 2 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "关闭窗口" }), { button: 0, pointerId: 3 });
    expect(startDraggingCurrentWindow).not.toHaveBeenCalled();
  });

  it("uses top-level workspace tabs without nested terminal tabs", async () => {
    const user = userEvent.setup();
    render(<App/>);

    const workspaceNavigation = screen.getByRole("navigation", { name: "工作区" });
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

    await user.click(workspace1);
    expect(workspace1.closest(".workspace-tab")).toHaveClass("selected");
    expect(stages[0]).toHaveAttribute("aria-hidden", "false");
    expect(stages[1]).toHaveAttribute("aria-hidden", "true");

    await user.click(workspace2);
    expect(workspace2.closest(".workspace-tab")).toHaveClass("selected");
    expect(stages[0]).toHaveAttribute("aria-hidden", "true");
    expect(stages[1]).toHaveAttribute("aria-hidden", "false");
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
