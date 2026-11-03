import { useEffect, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ServerApp } from "./ServerApp";

const state = vi.hoisted(() => ({
  phase: "workspace", busy: false, error: "", logout: vi.fn(), cancel: vi.fn(),
  clearError: vi.fn(() => { state.error = ""; }), login: vi.fn(), takeover: vi.fn(), acknowledgeReplaced: vi.fn(),
  mount: vi.fn(), unmount: vi.fn(),
}));
function PassThrough({ children }: { children: ReactNode }) { return children; }
vi.mock("./terminalLock", () => ({serverTerminalLock:{read:async()=>({locked:false})}}));
vi.mock("./useServerAccess", () => ({ useServerAccess: () => state }));
vi.mock("../app/theme/AppThemeProvider", () => ({ AppThemeProvider: PassThrough, useAppTheme: () => ({commitTheme:vi.fn()}) }));
vi.mock("../components/ThemedTitleTooltipProvider", () => ({ ThemedTitleTooltipProvider: PassThrough }));
vi.mock("../workspace/WorkspaceProvider", () => ({ WorkspaceProvider: PassThrough }));
vi.mock("../onboarding/OnboardingProvider", () => ({ OnboardingProvider: PassThrough }));
vi.mock("../terminal/notifications/TerminalNotificationProvider", () => ({ TerminalNotificationProvider: PassThrough }));
vi.mock("../app/useBrowserContextMenuGuard", () => ({ useBrowserContextMenuGuard: vi.fn() }));
vi.mock("./ServerRuntimeRestore", () => ({ ServerRuntimeRestore: () => null }));
vi.mock("../workspace/WorkspaceTerminalLinkHost", () => ({ WorkspaceTerminalLinkHost: () => null }));
vi.mock("../workspace/WorkspaceShell", () => ({ WorkspaceShell: function Workspace() {
  useEffect(() => { state.mount(); return state.unmount; }, []);
  return <main>当前终端画面</main>;
} }));

beforeEach(() => { vi.clearAllMocks(); state.phase = "workspace"; state.error = ""; });
afterEach(cleanup);

it.each(["replaced", "disconnected", "reconnecting"])("retains the same inert workbench behind the %s notice until confirmation", async phase => {
  const user = userEvent.setup();
  const view = render(<ServerApp/>);
  const terminal = await screen.findByText("当前终端画面");
  state.phase = phase;
  view.rerender(<ServerApp/>);
  expect(screen.getByText("当前终端画面")).toBe(terminal);
  expect(terminal.closest(".server-workspace")).toHaveAttribute("inert");
  expect(state.mount).toHaveBeenCalledOnce();
  expect(state.unmount).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("访问密码")).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", {name: phase === "replaced" ? "连接已被接管" : "连接已断开"})).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "确认" }));
  expect(state.acknowledgeReplaced).toHaveBeenCalledOnce();
  expect(state.logout).not.toHaveBeenCalled();
  state.phase = "login";
  view.rerender(<ServerApp/>);
  expect(screen.getByLabelText("访问密码")).toBeInTheDocument();
  expect(state.unmount).toHaveBeenCalledOnce();
});


it("anchors login errors to the password and clears them on editing", async () => {
  state.phase = "login";
  const view = render(<ServerApp/>);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(view.container.querySelector(".server-status")).toBeNull();
  expect(screen.queryByText(/单用户实例/)).not.toBeInTheDocument();
  state.error = "密码不正确";
  view.rerender(<ServerApp/>);
  const input = screen.getByLabelText("访问密码");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("密码不正确");
  expect(screen.getByRole("alert")).toHaveTextContent("密码不正确");
  await userEvent.type(input, "a");
  expect(state.clearError).toHaveBeenCalled();
  view.rerender(<ServerApp/>);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(input).toHaveAttribute("aria-invalid", "false");
  state.error = "密码不正确";
  view.rerender(<ServerApp/>);
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

it("shows connection restoration in the disabled submit button", () => {
  state.phase = "checking";
  render(<ServerApp/>);
  expect(screen.getByRole("button", {name: "正在恢复连接…"})).toBeDisabled();
});
