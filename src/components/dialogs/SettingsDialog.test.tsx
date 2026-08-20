import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "./SettingsDialog";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  selectDataDirectory: vi.fn(),
  updateDataDirectory: vi.fn(),
  updateSecuritySettings: vi.fn(),
}));
vi.mock("../../lib/tauri/settings", () => mocks);

beforeEach(() => {
  mocks.getSettings.mockResolvedValue({
    general: { dataDirectory: "C:\\Users\\demo\\.qterm", activeDataDirectory: "C:\\Users\\demo\\.qterm", restartRequired: false },
    security: { lockOnWindowsSessionLock: true, autoLockAfterSeconds: 3600 }, warning: null,
  });
  mocks.updateDataDirectory.mockImplementation(async ({ path }: { path: string }) => ({
    general: { dataDirectory: path || "C:\\Users\\demo\\.qterm", activeDataDirectory: "C:\\Users\\demo\\.qterm", restartRequired: Boolean(path) },
    security: { lockOnWindowsSessionLock: true, autoLockAfterSeconds: 3600 }, warning: null,
  }));
  mocks.updateSecuritySettings.mockImplementation(async (security) => ({
    general: { dataDirectory: "C:\\Users\\demo\\.qterm", activeDataDirectory: "C:\\Users\\demo\\.qterm", restartRequired: false },
    security, warning: null,
  }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SettingsDialog", () => {
  it("keeps navigation separate from the independently scrolling settings panel", async () => {
    render(<SettingsDialog onClose={vi.fn()}/>);
    const navigation = screen.getByRole("navigation", { name: "设置分类" });
    expect(within(navigation).getByRole("button", { name: /通用/ })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("button", { name: /安全/ })).not.toHaveAttribute("aria-current");
    await userEvent.click(within(navigation).getByRole("button", { name: /安全/ }));
    const securityPanel = await screen.findByRole("region", { name: "安全" });
    expect(await within(securityPanel).findByRole("switch", { name: "Windows 锁屏后锁定凭证" })).toBeInTheDocument();
    expect(within(securityPanel).getByRole("button", { name: "保存设置" })).toBeInTheDocument();
  });

  it("edits, selects, and restores the default data directory with migration guidance", async () => {
    const user = userEvent.setup();
    mocks.selectDataDirectory.mockResolvedValue("D:\\Portable Qterm");
    render(<SettingsDialog onClose={vi.fn()}/>);

    const path = await screen.findByRole("textbox", { name: "数据存储位置" });
    expect(path).toHaveValue("C:\\Users\\demo\\.qterm");
    expect(screen.getByText(/不会自动迁移或覆盖 connections\.json 与 secrets\.vault/)).toBeInTheDocument();
    expect(screen.getByText(/known-hosts\.json 与 workspaces\.json 仍保存在系统默认位置/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择文件夹" }));
    expect(mocks.selectDataDirectory).toHaveBeenCalledWith("C:\\Users\\demo\\.qterm");
    expect(path).toHaveValue("D:\\Portable Qterm");

    await user.click(screen.getByRole("button", { name: "恢复默认" }));
    expect(path).toHaveValue("~/.qterm");
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(mocks.updateDataDirectory).toHaveBeenCalledWith({ path: "~/.qterm" }));
  });

  it("shows restart guidance after saving a changed data directory", async () => {
    const user = userEvent.setup();
    render(<SettingsDialog onClose={vi.fn()}/>);
    const path = await screen.findByRole("textbox", { name: "数据存储位置" });
    await user.clear(path);
    await user.type(path, "D:\\Qterm Data");
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    expect(await screen.findByRole("status")).toHaveTextContent("重启 Qterm 后生效");
  });

  it("shows secure defaults and persists an explicit disabled timeout", async () => {
    const user = userEvent.setup();
    render(<SettingsDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("button", { name: /安全/ }));
    expect(await screen.findByRole("switch", { name: "Windows 锁屏后锁定凭证" })).toBeChecked();
    expect(screen.getByLabelText("凭证锁定时长")).toHaveValue("3600");
    await user.click(screen.getByRole("switch", { name: "启用定时锁定凭证" }));
    expect(screen.getByLabelText("凭证锁定时长")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(mocks.updateSecuritySettings).toHaveBeenCalledWith({ lockOnWindowsSessionLock: true, autoLockAfterSeconds: null }));
    expect(screen.getByRole("button", { name: "✓ 已保存" })).toBeInTheDocument();
  });

  it("places the timeout select before the right-aligned switch", async () => {
    render(<SettingsDialog onClose={vi.fn()}/>);
    await userEvent.click(await screen.findByRole("button", { name: /安全/ }));
    const controls = await screen.findByRole("group", { name: "定时锁定控制" });
    const select = within(controls).getByRole("combobox", { name: "凭证锁定时长" });
    const toggle = within(controls).getByRole("switch", { name: "启用定时锁定凭证" });
    expect(controls.firstElementChild).toBe(select);
    expect(controls.lastElementChild).toContainElement(toggle);
  });

  it("surfaces safe-default fallback warnings", async () => {
    mocks.getSettings.mockResolvedValue({
      general: { dataDirectory: "C:\\Users\\demo\\.qterm", activeDataDirectory: "C:\\Users\\demo\\.qterm", restartRequired: false },
      security: { lockOnWindowsSessionLock: true, autoLockAfterSeconds: 3600 }, warning: "corrupt",
    });
    render(<SettingsDialog onClose={vi.fn()}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("不会覆盖原文件");
  });
});
