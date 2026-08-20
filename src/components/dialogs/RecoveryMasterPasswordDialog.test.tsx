import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cancelMasterPasswordReset, prepareMasterPasswordReset, resetMasterPassword } from "../../lib/tauri/credentials";
import { RecoveryMasterPasswordDialog } from "./RecoveryMasterPasswordDialog";

vi.mock("../../lib/tauri/credentials", () => ({ cancelMasterPasswordReset: vi.fn(), prepareMasterPasswordReset: vi.fn(), resetMasterPassword: vi.fn() }));

beforeEach(() => {
  vi.mocked(prepareMasterPasswordReset).mockResolvedValue({ completed: true });
  vi.mocked(resetMasterPassword).mockResolvedValue({ completed: true });
  vi.mocked(cancelMasterPasswordReset).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("RecoveryMasterPasswordDialog", () => {
  it("validates the recovery key before asking for a new password and saving its replacement", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<RecoveryMasterPasswordDialog onClose={vi.fn()} onSuccess={onSuccess}/>);

    expect(screen.getByRole("dialog", { name: "验证恢复密钥" })).toBeInTheDocument();
    expect(screen.queryByLabelText("新主密码")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "选择恢复密钥文件" }));
    await waitFor(() => expect(prepareMasterPasswordReset).toHaveBeenCalledOnce());

    expect(screen.getByRole("dialog", { name: "设置新主密码" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("新主密码"), "new-master-password");
    await user.type(screen.getByLabelText("确认新主密码"), "new-master-password");
    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(screen.getByRole("dialog", { name: "保存新恢复密钥" })).toBeInTheDocument();
    expect(resetMasterPassword).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "保存新密钥到本地" }));
    await waitFor(() => expect(resetMasterPassword).toHaveBeenCalledWith("new-master-password"));
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("does not show the password step when recovery-key selection is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(prepareMasterPasswordReset).mockResolvedValue({ completed: false });
    render(<RecoveryMasterPasswordDialog onClose={vi.fn()} onSuccess={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "选择恢复密钥文件" }));

    expect(screen.getByRole("dialog", { name: "验证恢复密钥" })).toBeInTheDocument();
    expect(screen.queryByLabelText("新主密码")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(resetMasterPassword).not.toHaveBeenCalled();
  });

  it("shows an invalid recovery-key error before exposing the password step", async () => {
    const user = userEvent.setup();
    vi.mocked(prepareMasterPasswordReset).mockRejectedValue(new Error("恢复密钥不属于当前凭证库"));
    render(<RecoveryMasterPasswordDialog onClose={vi.fn()} onSuccess={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "选择恢复密钥文件" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("恢复密钥不属于当前凭证库");
    expect(screen.queryByLabelText("新主密码")).not.toBeInTheDocument();
  });

  it("validates the new password only after the recovery key was accepted", async () => {
    const user = userEvent.setup();
    render(<RecoveryMasterPasswordDialog onClose={vi.fn()} onSuccess={vi.fn()}/>);
    await user.click(screen.getByRole("button", { name: "选择恢复密钥文件" }));
    await user.type(await screen.findByLabelText("新主密码"), "too-short");
    await user.type(screen.getByLabelText("确认新主密码"), "too-short");
    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(screen.getByRole("alert")).toHaveTextContent("新主密码至少需要 12 个字符");
    expect(screen.queryByRole("dialog", { name: "保存新恢复密钥" })).not.toBeInTheDocument();
    expect(resetMasterPassword).not.toHaveBeenCalled();
  });

  it("keeps the new-key confirmation open when saving is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(resetMasterPassword).mockResolvedValue({ completed: false });
    render(<RecoveryMasterPasswordDialog onClose={vi.fn()} onSuccess={vi.fn()}/>);
    await user.click(screen.getByRole("button", { name: "选择恢复密钥文件" }));
    await user.type(await screen.findByLabelText("新主密码"), "new-master-password");
    await user.type(screen.getByLabelText("确认新主密码"), "new-master-password");
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "保存新密钥到本地" }));

    expect(screen.getByRole("dialog", { name: "保存新恢复密钥" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears pending recovery material when returning to key selection", async () => {
    const user = userEvent.setup();
    render(<RecoveryMasterPasswordDialog onClose={vi.fn()} onSuccess={vi.fn()}/>);
    await user.click(screen.getByRole("button", { name: "选择恢复密钥文件" }));
    await user.click(await screen.findByRole("button", { name: "返回" }));

    expect(cancelMasterPasswordReset).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "验证恢复密钥" })).toBeInTheDocument();
  });
});
