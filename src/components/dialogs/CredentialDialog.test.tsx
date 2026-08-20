import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialDialog } from "./CredentialDialog";

const mocks = vi.hoisted(() => ({
  clearVault: vi.fn(),
  createPasswordCredential: vi.fn(),
  deleteCredential: vi.fn(),
  getCredentialPublicKey: vi.fn(),
  getVaultStatus: vi.fn(),
  importPrivateKeyCredential: vi.fn(),
  listCredentials: vi.fn(),
  onVaultStatusChanged: vi.fn(),
  revealCredentialPassword: vi.fn(),
  writeClipboardText: vi.fn(),
}));

vi.mock("../../lib/tauri/credentials", () => mocks);
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: mocks.writeClipboardText }));
vi.mock("./MasterPasswordDialog", () => ({ MasterPasswordDialog: ({ mode, onSuccess }: { mode: string; onSuccess: () => void }) => <div data-testid="master-dialog">{mode}<button onClick={onSuccess}>完成</button></div> }));
vi.mock("./RecoveryMasterPasswordDialog", () => ({ RecoveryMasterPasswordDialog: ({ onSuccess }: { onSuccess: () => void }) => <div role="dialog" aria-label="使用恢复密钥重置"><button onClick={onSuccess}>完成恢复</button></div> }));

beforeEach(() => {
  mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: true, legacy: false });
  mocks.listCredentials.mockResolvedValue([
    { id: "password-1", name: "生产密码", kind: "password", detail: null },
    { id: "key-1", name: "部署私钥", kind: "privateKey", detail: "ed25519" },
  ]);
  mocks.createPasswordCredential.mockResolvedValue({ id: "password-2", name: "新密码", kind: "password", detail: null });
  mocks.deleteCredential.mockResolvedValue(undefined);
  mocks.getCredentialPublicKey.mockResolvedValue("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey deploy@example");
  mocks.revealCredentialPassword.mockResolvedValue("server-secret");
  mocks.writeClipboardText.mockResolvedValue(undefined);
  mocks.onVaultStatusChanged.mockResolvedValue(() => undefined);
  mocks.clearVault.mockResolvedValue(undefined);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("CredentialDialog", () => {
  it("requires a process-local unlock before listing credentials", async () => {
    const user = userEvent.setup();
    mocks.getVaultStatus.mockResolvedValueOnce({ initialized: true, unlocked: false }).mockResolvedValueOnce({ initialized: true, unlocked: true });
    render(<CredentialDialog onClose={vi.fn()}/>);
    expect(await screen.findByText("凭证库已锁定")).toBeInTheDocument();
    expect(mocks.listCredentials).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "解锁凭证库" }));
    expect(await screen.findByTestId("master-dialog")).toHaveTextContent("unlock");
    await user.click(screen.getByRole("button", { name: "完成" }));
    await waitFor(() => expect(mocks.listCredentials).toHaveBeenCalledOnce());
  });

  it("does not expose the global vault lock action in the dialog header", async () => {
    render(<CredentialDialog onClose={vi.fn()}/>);
    await screen.findByText("生产密码");
    expect(screen.queryByRole("button", { name: "锁定凭证库" })).not.toBeInTheDocument();
  });

  it("offers recovery reset only while an initialized vault is locked", async () => {
    const user = userEvent.setup();
    mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: false, legacy: false });
    render(<CredentialDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("button", { name: "使用恢复密钥重置" }));
    expect(screen.getByRole("dialog", { name: "使用恢复密钥重置" })).toBeInTheDocument();
  });

  it("clears an unsupported vault before starting fresh initialization", async () => {
    const user = userEvent.setup();
    mocks.getVaultStatus
      .mockResolvedValueOnce({ initialized: false, unlocked: false, legacy: true })
      .mockResolvedValueOnce({ initialized: false, unlocked: false, legacy: false });
    render(<CredentialDialog onClose={vi.fn()}/>);
    expect(await screen.findByText("检测到旧版凭证库")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除旧版凭证库" }));
    const dialog = screen.getByRole("dialog", { name: "清除整个凭证库？" });
    await user.type(within(dialog).getByLabelText("请输入“确认清除”以继续"), "确认清除");
    await user.click(within(dialog).getByRole("button", { name: "永久清除" }));
    await waitFor(() => expect(mocks.clearVault).toHaveBeenCalledWith("确认清除"));
    expect(await screen.findByTestId("master-dialog")).toHaveTextContent("initialize");
  });

  it("orders status before header actions and reacts to backend lock events", async () => {
    let statusHandler: ((event: { unlocked: boolean; reason: string }) => void) | undefined;
    mocks.onVaultStatusChanged.mockImplementation(async (handler) => { statusHandler = handler; return () => undefined; });
    render(<CredentialDialog onClose={vi.fn()}/>);
    await screen.findByText("生产密码");
    const actions = screen.getByRole("dialog", { name: "凭证管理" }).querySelector(".dialog-header-actions")!;
    const copy = actions.textContent ?? "";
    expect(copy.indexOf("已解锁")).toBeLessThan(copy.indexOf("修改主密码"));
    expect(copy.indexOf("修改主密码")).toBeLessThan(copy.indexOf("清除凭证库"));
    act(() => statusHandler?.({ unlocked: false, reason: "windowsSession" }));
    expect(screen.getByRole("button", { name: "解锁凭证库" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "锁定凭证库" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("requires the exact typed phrase before clearing the vault", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CredentialDialog onClose={onClose}/>);
    await screen.findByText("生产密码");
    await user.click(screen.getByRole("button", { name: "清除凭证库" }));
    const dialog = screen.getByRole("dialog", { name: "清除整个凭证库？" });
    const clearButton = within(dialog).getByRole("button", { name: "永久清除" });
    expect(clearButton).toBeDisabled();
    await user.type(within(dialog).getByLabelText("请输入“确认清除”以继续"), "确认清除");
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);
    await waitFor(() => expect(mocks.clearVault).toHaveBeenCalledWith("确认清除"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("creates password credentials and imports private keys through separate flows", async () => {
    const user = userEvent.setup();
    render(<CredentialDialog onClose={vi.fn()}/>);
    await screen.findByText("生产密码");
    await user.click(screen.getByRole("button", { name: "新建密码" }));
    await user.type(screen.getByLabelText("凭证名称"), "新密码");
    await user.type(screen.getByLabelText("密码"), "server-secret");
    await user.click(screen.getByRole("button", { name: "保存凭证" }));
    await waitFor(() => expect(mocks.createPasswordCredential).toHaveBeenCalledWith("新密码", "server-secret"));

    await user.click(screen.getByRole("button", { name: "导入私钥" }));
    await user.type(screen.getByLabelText("凭证名称"), "新私钥");
    await user.type(screen.getByLabelText("私钥口令（可选）"), "key-secret");
    await user.click(screen.getByRole("button", { name: "选择并导入" }));
    await waitFor(() => expect(mocks.importPrivateKeyCredential).toHaveBeenCalledWith("新私钥", "key-secret"));
  });

  it("requires confirmation before deleting and preserves the connection contract", async () => {
    const user = userEvent.setup();
    render(<CredentialDialog onClose={vi.fn()}/>);
    await screen.findByText("生产密码");
    await user.click(screen.getByRole("button", { name: /生产密码密码/ }));
    await user.click(screen.getByRole("button", { name: "删除凭证" }));
    const confirmation = screen.getByRole("dialog", { name: "删除凭证？" });
    expect(within(confirmation).getByText(/连接会保留/)).toBeInTheDocument();
    expect(mocks.deleteCredential).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(mocks.deleteCredential).toHaveBeenCalledWith("password-1"));
    const feedback = await screen.findByRole("status");
    expect(feedback).toHaveClass("credential-feedback-bubble", "manager");
    expect(feedback).toHaveTextContent("已删除“生产密码”，相关连接已解除引用");
  });

  it("reveals passwords only in password credential details and clears them when hidden", async () => {
    const user = userEvent.setup();
    render(<CredentialDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("button", { name: /生产密码密码/ }));

    expect(screen.getByLabelText("凭证密码")).toHaveValue("••••••••••••");
    await user.click(screen.getByRole("button", { name: "显示密码" }));
    await waitFor(() => expect(mocks.revealCredentialPassword).toHaveBeenCalledWith("password-1"));
    expect(screen.getByLabelText("凭证密码")).toHaveValue("server-secret");

    await user.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(screen.getByLabelText("凭证密码")).toHaveValue("••••••••••••");
    await user.click(screen.getByRole("button", { name: /部署私钥私钥/ }));
    expect(screen.queryByRole("button", { name: "显示密码" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("凭证密码")).not.toBeInTheDocument();
  });

  it("automatically derives an OpenSSH public key when a private key is selected and copies it", async () => {
    const user = userEvent.setup();
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    render(<CredentialDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("button", { name: /部署私钥私钥/ }));

    await waitFor(() => expect(mocks.getCredentialPublicKey).toHaveBeenCalledWith("key-1"));
    const publicKey = await screen.findByLabelText("OpenSSH 公钥");
    expect(publicKey).toHaveValue("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey deploy@example");
    expect(screen.queryByRole("button", { name: "生成公钥" })).not.toBeInTheDocument();
    const publicKeySection = publicKey.closest(".credential-public-key")!;
    const detailNote = screen.getByText(/删除凭证会解除连接引用/).closest(".credential-detail-note")!;
    expect(detailNote.compareDocumentPosition(publicKeySection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "复制公钥" }));
    await waitFor(() => expect(mocks.writeClipboardText).toHaveBeenCalledWith("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey deploy@example"));
    const feedback = screen.getByRole("status");
    expect(feedback).toHaveClass("credential-feedback-bubble", "item");
    expect(feedback).toHaveAttribute("data-feedback-for", "key-1");
    expect(feedback).toHaveTextContent("公钥已复制");
    expect(screen.queryByText("公钥已复制")?.closest(".credential-editor-pane")).toBeNull();

    const dismiss = timeoutSpy.mock.calls.find(([, delay]) => delay === 2_600)?.[0];
    expect(dismiss).toBeTypeOf("function");
    act(() => { if (typeof dismiss === "function") dismiss(); });
    expect(screen.queryByText("公钥已复制")).not.toBeInTheDocument();
    timeoutSpy.mockRestore();
  });
});
