import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getVersion: vi.fn(), checkForUpdate: vi.fn(), openLatestReleasePage: vi.fn() }));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("../../lib/updateCheck", () => ({ checkForUpdate: mocks.checkForUpdate, openLatestReleasePage: mocks.openLatestReleasePage, updateCheckMessage: (error: unknown) => error instanceof Error ? error.message : "无法检查更新。" }));

import { HelpDialog } from "./InfoDialogs";

beforeEach(() => {
  mocks.getVersion.mockResolvedValue("0.1.1");
  mocks.checkForUpdate.mockResolvedValue({ status: "latest", currentVersion: "0.1.1" });
  mocks.openLatestReleasePage.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("HelpDialog", () => {
  it("shows project metadata and the runtime application version without shortcut guidance", async () => {
    render(<HelpDialog onClose={vi.fn()}/>);

    expect(screen.getByRole("dialog", { name: "关于 Qterm" })).toBeInTheDocument();
    expect(screen.getByText("秋白")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "github.com/qiubai-lab/Qterm" })).toHaveAttribute("href", "https://github.com/qiubai-lab/Qterm");
    expect(await screen.findAllByText("v0.1.1")).toHaveLength(2);
    expect(screen.getByText("更新检测")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "检查更新" })).toBeInTheDocument();
    expect(screen.queryByText("新建工作区")).not.toBeInTheDocument();
  });

  it("reports an available version and opens the fixed download page", async () => {
    mocks.checkForUpdate.mockResolvedValue({ status: "available", currentVersion: "0.1.1", latestVersion: "0.1.12", publishedAt: "2026-08-20T05:37:55Z" });
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "检查更新" }));

    expect(await screen.findByText("发现新版本 v0.1.12")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "前往下载" }));
    expect(mocks.openLatestReleasePage).toHaveBeenCalledOnce();
  });

  it("disables repeated checks while a request is pending and reports failures", async () => {
    let rejectCheck: (error: Error) => void = () => undefined;
    mocks.checkForUpdate.mockImplementation(() => new Promise((_, reject) => { rejectCheck = reject; }));
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()}/>);

    const checkButton = screen.getByRole("button", { name: "检查更新" });
    await user.click(checkButton);
    expect(screen.getByRole("button", { name: "正在检查…" })).toBeDisabled();
    expect(mocks.checkForUpdate).toHaveBeenCalledOnce();
    rejectCheck(new Error("无法连接更新服务，请稍后重试。"));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接更新服务，请稍后重试。");
  });

  it("labels browser-only development builds when application metadata is unavailable", async () => {
    mocks.getVersion.mockRejectedValue(new Error("Tauri runtime unavailable"));
    render(<HelpDialog onClose={vi.fn()}/>);

    expect(await screen.findAllByText("开发构建")).toHaveLength(2);
  });
});
