import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppThemeProvider } from "../../app/theme/AppThemeProvider";
import { SettingsDialog } from "./SettingsDialog";

const mocks = vi.hoisted(() => ({ getSettings: vi.fn(), updateTerminalSettings: vi.fn() }));
vi.mock("../../lib/tauri/settings", () => mocks);
let terminal = { remoteShellIntegrationEnabled: false, historyFreeBashEnabled: false };
const snapshot = () => ({ general: { rootDirectory: "/test" }, security: {}, appearance: { theme: "dark" }, terminal, warning: null });

beforeEach(() => {
  terminal = { remoteShellIntegrationEnabled: false, historyFreeBashEnabled: false };
  mocks.getSettings.mockImplementation(async () => snapshot());
  mocks.updateTerminalSettings.mockImplementation(async patch => { terminal = { ...terminal, ...patch }; return snapshot(); });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

async function open() {
  render(<AppThemeProvider><SettingsDialog onClose={() => undefined}/></AppThemeProvider>);
  await userEvent.click(screen.getByRole("button", { name: /高级/ }));
  return screen.findByRole("switch", { name: "禁用 Bash 历史记录" });
}

it("scrolls advanced options separately from the heading and feedback", async () => {
  await open();
  const viewport = screen.getByRole("region", { name: "高级设置选项" });
  expect(screen.queryByRole("switch", { name: "显示应用标题" })).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "OSC 133 命令导航" })).not.toBeInTheDocument();
  expect(viewport).toHaveAttribute("tabindex", "0");
  expect(viewport.parentElement).toHaveAttribute("data-density", "compact");
  expect(viewport).not.toContainElement(screen.getByRole("heading", { name: "高级" }));
  expect(viewport).not.toContainElement(screen.getByText("管理远程终端集成等进阶功能。"));
  expect(document.querySelector(".settings-content-fixed")).toContainElement(viewport);
  expect(viewport).not.toContainElement(document.querySelector(".settings-actions"));
});

it("labels the opt-in as experimental, saves immediately, and restores it without changing OSC", async () => {
  const toggle = await open();
  expect(toggle).not.toBeChecked();
  expect(toggle.closest(".settings-row")?.querySelector(".settings-experimental-tag")).toHaveTextContent("实验功能");
  expect(screen.getByText(/仅对新建和重连的终端生效/)).toHaveTextContent("正常加载用户 Bash 配置，不记录本会话的新命令，不清除已有历史");
  await userEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());
  expect(mocks.updateTerminalSettings).toHaveBeenCalledWith({ historyFreeBashEnabled: true });
  expect(screen.getByRole("switch", { name: "OSC 7 终端目录跟踪" })).not.toBeChecked();
  cleanup();
  const restored = await open();
  expect(restored).toBeChecked();
  await userEvent.click(restored);
  await waitFor(() => expect(restored).not.toBeChecked());
});

it("keeps the saved state on failure and disables controls while saving", async () => {
  const toggle = await open();
  let reject!: (error: Error) => void;
  mocks.updateTerminalSettings.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await userEvent.click(toggle);
  expect(toggle).toBeDisabled();
  expect(screen.getByRole("switch", { name: "OSC 7 终端目录跟踪" })).toBeDisabled();
  reject(new Error("无法保存终端设置"));
  expect(await screen.findByRole("alert")).toHaveTextContent("无法保存终端设置");
  expect(toggle).not.toBeChecked();
  expect(toggle).toBeEnabled();
});
