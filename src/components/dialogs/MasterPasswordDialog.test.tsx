import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeVault } from "../../lib/tauri/credentials";
import { MasterPasswordDialog } from "./MasterPasswordDialog";

vi.mock("../../lib/tauri/credentials", () => ({ initializeVault: vi.fn(), unlockVault: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("MasterPasswordDialog", () => {
  it("requires a 12 character matching master password before initialization", async () => {
    const user = userEvent.setup();
    render(<MasterPasswordDialog mode="initialize" onSuccess={vi.fn()} onClose={vi.fn()}/>);
    await user.type(screen.getByLabelText("主密码"), "short");
    await user.type(screen.getByLabelText("确认主密码"), "short");
    await user.click(screen.getByRole("button", { name: "初始化" }));
    expect(screen.getByRole("alert")).toHaveTextContent("至少需要 12 个字符");
    expect(initializeVault).not.toHaveBeenCalled();
  });

  it("does not report initialization when recovery file saving is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(initializeVault).mockResolvedValue({ completed: false });
    const onSuccess = vi.fn();
    render(<MasterPasswordDialog mode="initialize" onSuccess={onSuccess} onClose={vi.fn()}/>);
    await user.type(screen.getByLabelText("主密码"), "correct-master-password");
    await user.type(screen.getByLabelText("确认主密码"), "correct-master-password");
    await user.click(screen.getByRole("button", { name: "初始化" }));
    expect(initializeVault).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "保存恢复密钥" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存到本地并初始化" }));
    expect(initializeVault).toHaveBeenCalledWith("correct-master-password");
    expect(screen.getByRole("dialog", { name: "保存恢复密钥" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("reports success only after the backend saved a recovery file and initialized", async () => {
    const user = userEvent.setup();
    vi.mocked(initializeVault).mockResolvedValue({ completed: true });
    const onSuccess = vi.fn();
    render(<MasterPasswordDialog mode="initialize" onSuccess={onSuccess} onClose={vi.fn()}/>);
    await user.type(screen.getByLabelText("主密码"), "correct-master-password");
    await user.type(screen.getByLabelText("确认主密码"), "correct-master-password");
    await user.click(screen.getByRole("button", { name: "初始化" }));
    expect(initializeVault).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "保存到本地并初始化" }));
    expect(initializeVault).toHaveBeenCalledWith("correct-master-password");
    expect(onSuccess).toHaveBeenCalledOnce();
  });
});
