import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionAuthDialog } from "./ConnectionAuthDialog";

const mocks = vi.hoisted(() => ({
  getVaultStatus: vi.fn(),
  listCredentials: vi.fn(),
}));

vi.mock("../../lib/tauri/credentials", () => mocks);
vi.mock("./MasterPasswordDialog", () => ({ MasterPasswordDialog: ({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) => <div role="dialog" aria-label="解锁凭证库"><button onClick={onSuccess}>完成解锁</button><button onClick={onClose}>取消解锁</button></div> }));

const passwordProfile = { id: "profile-1", name: "Production", host: "192.168.3.210", port: 22, username: "root", authPreference: "password" as const, credentialId: null, groupId: null };
const keyProfile = { ...passwordProfile, id: "profile-2", authPreference: "privateKey" as const };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ConnectionAuthDialog", () => {
  beforeEach(() => {
    mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: true });
    mocks.listCredentials.mockResolvedValue([{ id: "credential-1", name: "部署私钥", kind: "privateKey", detail: "ed25519" }]);
  });
  it("defaults to password auth and clears the secret as soon as connection starts", async () => {
    const user = userEvent.setup();
    let finish: (() => void) | undefined;
    const onConnect = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onClose = vi.fn();
    render(<ConnectionAuthDialog profile={passwordProfile} onConnect={onConnect} onClose={onClose}/>);

    const input = screen.getByLabelText("密码");
    expect(input).toHaveFocus();
    expect(input.closest("label")).toHaveClass("auth-password-field");
    await user.type(input, "temporary-secret");
    await user.click(screen.getByRole("button", { name: "连接" }));

    expect(onConnect).toHaveBeenCalledWith({ method: "password", password: "temporary-secret" });
    expect(input).toHaveValue("");
    await act(async () => finish?.());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses an existing credential for this connection without changing the profile", async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn().mockResolvedValue(undefined);
    render(<ConnectionAuthDialog profile={keyProfile} onConnect={onConnect} onClose={vi.fn()}/>);

    await user.selectOptions(await screen.findByLabelText("选择凭证"), "credential-1");
    await user.click(screen.getByRole("button", { name: "连接" }));

    expect(onConnect).toHaveBeenCalledWith({ method: "storedCredential", credentialId: "credential-1" });
  });

  it("connects with SSH Agent without asking for a local secret", async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn().mockResolvedValue(undefined);
    render(<ConnectionAuthDialog profile={passwordProfile} onConnect={onConnect} onClose={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "SSH Agent" }));
    expect(screen.queryByLabelText("密码")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("选择凭证")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "连接" }));

    expect(onConnect).toHaveBeenCalledWith({ method: "sshAgent" });
  });

  it("keeps one stable authentication layout while switching methods", async () => {
    const user = userEvent.setup();
    render(<ConnectionAuthDialog profile={passwordProfile} onConnect={vi.fn().mockResolvedValue(undefined)} onClose={vi.fn()}/>);

    const dialog = screen.getByRole("dialog", { name: "连接 Production" });
    expect(dialog).toHaveClass("connection-auth-dialog");
    expect(dialog.querySelector(".auth-method-content")).toHaveAttribute("data-method", "password");
    expect(screen.queryByText(/密码认证存在泄露风险/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "凭证" }));
    expect(dialog.querySelector(".auth-method-content")).toHaveAttribute("data-method", "credential");
    expect(dialog.querySelector(".auth-method-panel")).toHaveClass("auth-forward");
    expect(await screen.findByLabelText("选择凭证")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "密码" }));
    expect(dialog.querySelector(".auth-method-panel")).toHaveClass("auth-backward");

    await user.click(screen.getByRole("button", { name: "SSH Agent" }));
    expect(dialog.querySelector(".auth-method-content")).toHaveAttribute("data-method", "sshAgent");
    expect(dialog.querySelector(".auth-method-panel")).toHaveClass("auth-forward");
    expect(screen.getByText("推荐")).toBeInTheDocument();
    expect(screen.getByText(/本次选择仅用于当前连接/)).toBeInTheDocument();
  });

  it("keeps the current-connection notice horizontally aligned with the actions", () => {
    render(<ConnectionAuthDialog profile={passwordProfile} onConnect={vi.fn().mockResolvedValue(undefined)} onClose={vi.fn()}/>);

    const notice = screen.getByText("本次选择仅用于当前连接，不会修改连接配置。");
    const footer = notice.closest("footer");
    expect(footer).toHaveClass("auth-dialog-actions", "dialog-actions-with-status");
    expect(within(footer!).getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(within(footer!).getByRole("button", { name: "连接" })).toBeInTheDocument();
  });

  it("unlocks only after the user chooses the credential path", async () => {
    mocks.getVaultStatus.mockResolvedValueOnce({ initialized: true, unlocked: false }).mockResolvedValueOnce({ initialized: true, unlocked: true });
    const user = userEvent.setup();
    render(<ConnectionAuthDialog profile={{ ...passwordProfile, authPreference: "manual" }} onConnect={vi.fn().mockResolvedValue(undefined)} onClose={vi.fn()}/>);

    expect(screen.queryByRole("dialog", { name: "解锁凭证库" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "凭证" }));
    await user.click(await screen.findByRole("button", { name: "解锁凭证库" }));
    await user.click(screen.getByRole("button", { name: "完成解锁" }));
    expect(await screen.findByLabelText("选择凭证")).toBeInTheDocument();
  });

  it("cancels without submitting credentials", async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ConnectionAuthDialog profile={passwordProfile} onConnect={onConnect} onClose={onClose}/>);
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onConnect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
