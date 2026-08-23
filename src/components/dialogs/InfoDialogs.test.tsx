import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  checkForUpdate: vi.fn(),
  openLatestReleasePage: vi.fn(),
  writeClipboardText: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: mocks.writeClipboardText }));
vi.mock("../../lib/updateCheck", () => ({ checkForUpdate: mocks.checkForUpdate, openLatestReleasePage: mocks.openLatestReleasePage, updateCheckMessage: (error: unknown) => error instanceof Error ? error.message : "无法检查更新。" }));

import { HelpDialog } from "./InfoDialogs";

beforeEach(() => {
  mocks.getVersion.mockResolvedValue("0.1.1");
  mocks.checkForUpdate.mockResolvedValue({ status: "latest", currentVersion: "0.1.1" });
  mocks.openLatestReleasePage.mockResolvedValue(undefined);
  mocks.writeClipboardText.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("HelpDialog", () => {
  it("shows project metadata and the runtime application version without shortcut guidance", async () => {
    render(<HelpDialog onClose={vi.fn()}/>);

    expect(screen.getByRole("dialog", { name: "关于 Qterm" })).toBeInTheDocument();
    expect(screen.getByText("秋白")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "github.com/qiubai-lab/Qterm" })).toHaveAttribute("href", "https://github.com/qiubai-lab/Qterm");
    expect(await screen.findAllByText("v0.1.1")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "检测更新" })).toHaveClass("ui-button--primary", "about-update-action");
    expect(screen.queryByRole("dialog", { name: "检测更新" })).not.toBeInTheDocument();
    expect(screen.queryByText("新建工作区")).not.toBeInTheDocument();
  });

  it("opens a compact dialog, starts checking immediately, and always shows the Homebrew command", async () => {
    let resolveCheck: (result: { status: "latest"; currentVersion: string }) => void = () => undefined;
    mocks.checkForUpdate.mockImplementation(() => new Promise((resolve) => { resolveCheck = resolve; }));
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "检测更新" }));

    expect(screen.getByRole("dialog", { name: "检测更新" })).toBeInTheDocument();
    expect(screen.getByText("brew update && brew upgrade --cask qterm")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新检测" })).not.toBeInTheDocument();
    expect(mocks.checkForUpdate).toHaveBeenCalledOnce();

    resolveCheck({ status: "latest", currentVersion: "0.1.1" });
    expect(await screen.findByText("当前已是最新版本 v0.1.1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新检测" })).toHaveClass("update-check-recheck");
  });

  it("reports an available version and opens the fixed release page", async () => {
    mocks.checkForUpdate.mockResolvedValue({ status: "available", currentVersion: "0.1.1", latestVersion: "0.1.12", publishedAt: "2026-08-20T05:37:55Z" });
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "检测更新" }));

    expect(await screen.findByText("发现新版本 v0.1.12")).toBeInTheDocument();
    expect(screen.getByText("当前版本 v0.1.1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前往 Releases" })).toHaveClass("ui-button--primary", "update-check-release");
    await user.click(screen.getByRole("button", { name: "前往 Releases" }));
    expect(mocks.openLatestReleasePage).toHaveBeenCalledOnce();
  });

  it("reports failures and allows a retry without closing the dialog", async () => {
    mocks.checkForUpdate
      .mockRejectedValueOnce(new Error("无法连接更新服务，请稍后重试。"))
      .mockResolvedValueOnce({ status: "latest", currentVersion: "0.1.1" });
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "检测更新" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接更新服务，请稍后重试。");
    await user.click(screen.getByRole("button", { name: "重新检测" }));
    expect(await screen.findByText("当前已是最新版本 v0.1.1")).toBeInTheDocument();
    expect(mocks.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("copies the README Homebrew update command", async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "检测更新" }));
    await user.click(screen.getByRole("button", { name: "复制 Homebrew 更新命令" }));

    expect(mocks.writeClipboardText).toHaveBeenCalledWith("brew update && brew upgrade --cask qterm");
    expect(screen.getByRole("button", { name: "已复制 Homebrew 更新命令" })).toBeInTheDocument();
    expect(screen.queryByText("此窗口不会自动执行命令。")).not.toBeInTheDocument();
  });

  it("closes only the nested update dialog and restores focus to its launcher", async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()}/>);
    const launcher = screen.getByRole("button", { name: "检测更新" });

    await user.click(launcher);
    const updateDialog = screen.getByRole("dialog", { name: "检测更新" });
    expect(screen.getByRole("dialog", { name: "关于 Qterm" }).parentElement).not.toHaveClass("dialog-scrim-blocking");
    expect(within(updateDialog).getAllByRole("button", { name: "关闭" })).toHaveLength(1);
    await user.click(within(updateDialog).getByRole("button", { name: "关闭" }));

    expect(screen.queryByRole("dialog", { name: "检测更新" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "关于 Qterm" })).toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("labels browser-only development builds when application metadata is unavailable", async () => {
    mocks.getVersion.mockRejectedValue(new Error("Tauri runtime unavailable"));
    render(<HelpDialog onClose={vi.fn()}/>);

    expect(await screen.findAllByText("开发构建")).toHaveLength(2);
  });
});
