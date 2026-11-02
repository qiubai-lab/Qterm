import { useEffect, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ServerApp } from "./ServerApp";

const state = vi.hoisted(() => ({
  phase: "workspace", busy: false, error: "", logout: vi.fn(), cancel: vi.fn(),
  login: vi.fn(), takeover: vi.fn(), acknowledgeReplaced: vi.fn(),
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

it("retains the same inert workbench behind the notice until confirmation", async () => {
  const user = userEvent.setup();
  const view = render(<ServerApp/>);
  const terminal = await screen.findByText("当前终端画面");
  state.phase = "replaced";
  view.rerender(<ServerApp/>);
  expect(screen.getByText("当前终端画面")).toBe(terminal);
  expect(terminal.closest(".server-workspace")).toHaveAttribute("inert");
  expect(state.mount).toHaveBeenCalledOnce();
  expect(state.unmount).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("访问密码")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "确认" }));
  expect(state.acknowledgeReplaced).toHaveBeenCalledOnce();
  expect(state.logout).not.toHaveBeenCalled();
  state.phase = "login";
  view.rerender(<ServerApp/>);
  expect(screen.getByLabelText("访问密码")).toBeInTheDocument();
  expect(state.unmount).toHaveBeenCalledOnce();
});
