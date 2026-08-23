import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "./SettingsDialog";
import { AppThemeProvider } from "../../app/theme/AppThemeProvider";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  selectConfigurationDirectory: vi.fn(),
  updateConfigurationDirectory: vi.fn(),
  updateSecuritySettings: vi.fn(),
  updateAppearanceSettings: vi.fn(),
}));
vi.mock("../../lib/tauri/settings", () => mocks);

beforeEach(() => {
  mocks.getSettings.mockResolvedValue({
    general: storageLayout(),
    security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: null }, appearance: { theme: "dark" }, warning: null,
  });
  mocks.updateConfigurationDirectory.mockImplementation(async ({ path }: { path: string }) => ({
    general: { ...storageLayout(), rootDirectory: path, dataDirectory: `${path}\\data`, deviceDirectory: `${path}\\device`, cacheDirectory: `${path}\\cache`, restartRequired: true },
    security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: null }, appearance: { theme: "dark" }, warning: null,
  }));
  mocks.updateSecuritySettings.mockImplementation(async (security) => ({
    general: storageLayout(),
    security, appearance: { theme: "dark" }, warning: null,
  }));
  mocks.updateAppearanceSettings.mockImplementation(async (appearance) => ({
    general: storageLayout(),
    security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: null },
    appearance,
    warning: null,
  }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function storageLayout() {
  return {
    rootDirectory: "C:\\Users\\demo\\.qterm",
    activeRootDirectory: "C:\\Users\\demo\\.qterm",
    dataDirectory: "C:\\Users\\demo\\.qterm\\data",
    deviceDirectory: "C:\\Users\\demo\\.qterm\\device",
    cacheDirectory: "C:\\Users\\demo\\.qterm\\cache",
    restartRequired: false,
  };
}

function renderSettings(onClose = vi.fn()) {
  return render(<AppThemeProvider><SettingsDialog onClose={onClose}/></AppThemeProvider>);
}

describe("SettingsDialog", () => {
  it("keeps navigation separate from the independently scrolling settings panel", async () => {
    renderSettings();
    const navigation = screen.getByRole("navigation", { name: "设置分类" });
    expect(within(navigation).getByRole("button", { name: /通用/ })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("button", { name: /安全/ })).not.toHaveAttribute("aria-current");
    await userEvent.click(within(navigation).getByRole("button", { name: /安全/ }));
    const securityPanel = await screen.findByRole("region", { name: "安全" });
    expect(await within(securityPanel).findByRole("switch", { name: "启用凭证库有效期" })).toBeInTheDocument();
    expect(within(securityPanel).getByRole("switch", { name: "启用无操作后锁定终端" })).toBeInTheDocument();
    expect(within(securityPanel).queryByText(/Windows 锁屏/)).not.toBeInTheDocument();
    expect(within(securityPanel).getByRole("button", { name: "保存设置" })).toBeInTheDocument();
  });

  it("separates configuration directory controls from the derived path overview", async () => {
    const user = userEvent.setup();
    mocks.selectConfigurationDirectory.mockResolvedValue("D:\\Qterm");
    renderSettings();

    const directorySettings = await screen.findByRole("group", { name: "配置目录设置" });
    const pathOverview = screen.getByRole("group", { name: "配置路径" });
    const input = within(directorySettings).getByRole("textbox", { name: "Qterm 配置目录" });
    expect(input).toHaveValue("C:\\Users\\demo\\.qterm");
    expect(input).toHaveAttribute("readonly");
    expect(within(pathOverview).getByText("C:\\Users\\demo\\.qterm\\data")).toBeInTheDocument();
    expect(within(pathOverview).getByText("C:\\Users\\demo\\.qterm\\device")).toBeInTheDocument();
    expect(within(pathOverview).getByText("C:\\Users\\demo\\.qterm\\cache")).toBeInTheDocument();
    const chooseButton = within(directorySettings).getByRole("button", { name: "选择 Qterm 配置目录" });
    const resetButton = within(directorySettings).getByRole("button", { name: "恢复默认 Qterm 配置目录" });
    expect(chooseButton.querySelector('[data-icon="files"]')).not.toBeNull();
    expect(resetButton.querySelector('[data-icon="refresh"]')).not.toBeNull();
    await user.click(chooseButton);
    expect(mocks.selectConfigurationDirectory).toHaveBeenCalledWith("C:\\Users\\demo\\.qterm");
    expect(input).toHaveValue("D:\\Qterm");
    expect(within(pathOverview).getByText("D:\\Qterm\\data")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(mocks.updateConfigurationDirectory).toHaveBeenCalledWith({ path: "D:\\Qterm" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("重启 Qterm 后生效");
    expect(status.closest("footer")).not.toBeNull();
  });

  it("restores the default root while derived paths remain read-only", async () => {
    const user = userEvent.setup();
    mocks.selectConfigurationDirectory.mockResolvedValue("D:\\Custom");
    renderSettings();
    const input = await screen.findByRole("textbox", { name: "Qterm 配置目录" });
    await user.click(screen.getByRole("button", { name: "选择 Qterm 配置目录" }));
    expect(input).toHaveValue("D:\\Custom");
    await user.click(screen.getByRole("button", { name: "恢复默认 Qterm 配置目录" }));
    expect(input).toHaveValue("~/.qterm");
    expect(screen.queryByRole("textbox", { name: "核心数据目录" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "设备数据目录" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "缓存目录" })).not.toBeInTheDocument();
    expect(screen.queryByText(/当前加载/)).not.toBeInTheDocument();
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("不会迁移或覆盖旧文件");
    expect(note.querySelector('[data-icon="help"]')).not.toBeNull();
    expect(note.previousElementSibling).toHaveAttribute("aria-label", "配置目录设置");
    expect(note.nextElementSibling).toHaveAttribute("aria-label", "配置路径");
  });

  it("shows the new defaults and persists both independent lock policies", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole("button", { name: /安全/ }));
    expect(await screen.findByRole("switch", { name: "启用凭证库有效期" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "启用无操作后锁定终端" })).not.toBeChecked();
    expect(screen.getByLabelText("凭证库有效期")).toHaveValue("3600");
    await user.click(screen.getByRole("switch", { name: "启用凭证库有效期" }));
    await user.click(screen.getByRole("switch", { name: "启用无操作后锁定终端" }));
    expect(screen.getByLabelText("凭证库有效期")).toBeDisabled();
    expect(screen.getByLabelText("终端空闲时长")).toHaveValue("900");
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(mocks.updateSecuritySettings).toHaveBeenCalledWith({ credentialAutoLockAfterSeconds: null, terminalAutoLockAfterSeconds: 900 }));
    expect(screen.getByRole("button", { name: "✓ 已保存" })).toBeInTheDocument();
  });

  it("places the timeout select before the right-aligned switch", async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: /安全/ }));
    const controls = await screen.findByRole("group", { name: "凭证库有效期控制" });
    const select = within(controls).getByRole("combobox", { name: "凭证库有效期" });
    const toggle = within(controls).getByRole("switch", { name: "启用凭证库有效期" });
    expect(controls.firstElementChild).toBe(select);
    expect(controls.lastElementChild).toContainElement(toggle);
  });

  it("previews a preset and restores the persisted theme when closed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSettings(onClose);
    await user.click(await screen.findByRole("button", { name: /外观/ }));
    const light = screen.getByRole("radio", { name: /亮色/ });
    const dark = screen.getByRole("radio", { name: /深色/ });
    expect(dark).toBeChecked();
    expect(dark.closest("label")?.querySelector(".settings-theme-check")).toHaveTextContent("✓");
    expect(light.closest("label")?.querySelector(".settings-theme-check")).toBeNull();
    await user.click(light);
    expect(light).toBeChecked();
    expect(light.closest("label")?.querySelector(".settings-theme-check")).toHaveTextContent("✓");
    expect(dark.closest("label")?.querySelector(".settings-theme-check")).toBeNull();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("persists the previewed preset and keeps it after closing", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole("button", { name: /外观/ }));
    await user.click(screen.getByRole("radio", { name: /亮色/ }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(mocks.updateAppearanceSettings).toHaveBeenCalledWith({ theme: "light" }));
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("restores the persisted preset when appearance saving fails", async () => {
    const user = userEvent.setup();
    mocks.updateAppearanceSettings.mockRejectedValueOnce(new Error("save failed"));
    renderSettings();
    await user.click(await screen.findByRole("button", { name: /外观/ }));
    await user.click(screen.getByRole("radio", { name: /亮色/ }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("save failed");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("surfaces safe-default fallback warnings", async () => {
    mocks.getSettings.mockResolvedValue({
      general: storageLayout(),
      security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: null }, appearance: { theme: "dark" }, warning: "corrupt",
    });
    renderSettings();
    expect(await screen.findByRole("alert")).toHaveTextContent("不会覆盖原文件");
  });
});
