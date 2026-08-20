import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getVersion: vi.fn() }));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));

import { HelpDialog } from "./InfoDialogs";

beforeEach(() => { mocks.getVersion.mockResolvedValue("0.1.1"); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("HelpDialog", () => {
  it("shows project metadata and the runtime application version without shortcut guidance", async () => {
    render(<HelpDialog onClose={vi.fn()}/>);

    expect(screen.getByRole("dialog", { name: "关于 Qterm" })).toBeInTheDocument();
    expect(screen.getByText("Qterm contributors")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "github.com/qiubai-lab/Qterm" })).toHaveAttribute("href", "https://github.com/qiubai-lab/Qterm");
    expect(await screen.findAllByText("v0.1.1")).toHaveLength(2);
    expect(screen.getByText("更新检测")).toBeInTheDocument();
    expect(screen.getByText("功能规划中")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看发布页" })).not.toBeInTheDocument();
    expect(screen.queryByText("新建工作区")).not.toBeInTheDocument();
  });

  it("labels browser-only development builds when application metadata is unavailable", async () => {
    mocks.getVersion.mockRejectedValue(new Error("Tauri runtime unavailable"));
    render(<HelpDialog onClose={vi.fn()}/>);

    expect(await screen.findAllByText("开发构建")).toHaveLength(2);
  });
});
