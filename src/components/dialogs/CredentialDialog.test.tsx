import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialDialog } from "./CredentialDialog";

const mocks = vi.hoisted(() => ({
  clearVault: vi.fn(),
  cancelPrivateKeyCredential: vi.fn(),
  commitPrivateKeyCredential: vi.fn(),
  createPasswordCredential: vi.fn(),
  deleteCredential: vi.fn(),
  getCredentialPublicKey: vi.fn(),
  getVaultStatus: vi.fn(),
  preparePrivateKeyCredential: vi.fn(),
  prepareDroppedPrivateKeyCredential: vi.fn(),
  prepareGeneratedPrivateKeyCredential: vi.fn(),
  renameCredential: vi.fn(),
  listCredentials: vi.fn(),
  onVaultStatusChanged: vi.fn(),
  revealCredentialPassword: vi.fn(),
  writeClipboardText: vi.fn(),
  dragDrop: { handler: null as null | ((event: { payload: Record<string, unknown> }) => void) },
}));

vi.mock("../../lib/tauri/credentials", () => mocks);
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ onDragDropEvent: vi.fn(async (handler) => { mocks.dragDrop.handler = handler; return () => { mocks.dragDrop.handler = null; }; }) }) }));
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
  mocks.commitPrivateKeyCredential.mockResolvedValue({ id: "generated-key", name: "新生成私钥", kind: "privateKey", detail: "ecdsa-p256" });
  mocks.getCredentialPublicKey.mockResolvedValue("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey deploy@example");
  mocks.revealCredentialPassword.mockResolvedValue("server-secret");
  mocks.renameCredential.mockResolvedValue({ id: "key-1", name: "生产部署私钥", kind: "privateKey", detail: "ed25519" });
  mocks.writeClipboardText.mockResolvedValue(undefined);
  mocks.onVaultStatusChanged.mockResolvedValue(() => undefined);
  mocks.clearVault.mockResolvedValue(undefined);
  mocks.preparePrivateKeyCredential.mockResolvedValue({ id: "draft-file", source: "file", label: "id_ed25519", detail: "本地私钥文件" });
  mocks.prepareDroppedPrivateKeyCredential.mockResolvedValue({ id: "draft-file", source: "file", label: "id_ed25519", detail: "本地私钥文件" });
  mocks.prepareGeneratedPrivateKeyCredential.mockResolvedValue({ id: "draft-generated", source: "generated", label: "ECDSA P-256", detail: "已生成，尚未保存" });
  mocks.cancelPrivateKeyCredential.mockResolvedValue(undefined);
  mocks.dragDrop.handler = null;
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("CredentialDialog", () => {
  it("renames a credential inline and supports keyboard save", async () => {
    const user = userEvent.setup();
    mocks.listCredentials.mockResolvedValue([
      { id: "password-1", name: "生产密码", kind: "password", detail: null },
      { id: "key-1", name: "部署私钥", kind: "privateKey", detail: "ed25519" },
    ]);
    render(<CredentialDialog onClose={vi.fn()}/>);

    await user.click(await screen.findByRole("button", { name: /部署私钥私钥/ }));
    await user.click(screen.getByRole("button", { name: "修改凭证名称" }));
    const input = screen.getByRole("textbox", { name: "凭证名称" });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("部署私钥");
    expect(screen.queryByRole("button", { name: "保存凭证名称" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消修改名称" })).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "  生产部署私钥  {Enter}");

    await waitFor(() => expect(mocks.renameCredential).toHaveBeenCalledWith("key-1", "  生产部署私钥  "));
    expect(await screen.findByText("生产部署私钥", { selector: ".credential-editor-heading strong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生产部署私钥私钥/ })).toBeInTheDocument();
  });

  it("cancels inline rename with Escape and keeps an RSA warning visible while editing", async () => {
    const user = userEvent.setup();
    mocks.listCredentials.mockResolvedValue([
      { id: "rsa-key", name: "旧服务器私钥", kind: "privateKey", detail: "rsa" },
    ]);
    render(<CredentialDialog onClose={vi.fn()}/>);

    await user.click(await screen.findByRole("button", { name: /旧服务器私钥.*不安全.*私钥/ }));
    await user.click(screen.getByRole("button", { name: "修改凭证名称" }));
    const input = screen.getByRole("textbox", { name: "凭证名称" });
    expect(input.closest(".credential-name-line")).toHaveTextContent("不安全");
    await user.clear(input);
    await user.type(input, "临时名称{Escape}");

    expect(screen.queryByRole("textbox", { name: "凭证名称" })).not.toBeInTheDocument();
    expect(screen.getByText("旧服务器私钥", { selector: ".credential-editor-heading strong" })).toBeInTheDocument();
    expect(mocks.renameCredential).not.toHaveBeenCalled();
  });

  it("keeps rename input available when persistence fails", async () => {
    const user = userEvent.setup();
    mocks.renameCredential.mockRejectedValue(new Error("凭证库已锁定"));
    render(<CredentialDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("button", { name: /生产密码密码/ }));
    await user.click(screen.getByRole("button", { name: "修改凭证名称" }));
    const input = screen.getByRole("textbox", { name: "凭证名称" });
    await user.clear(input);
    await user.type(input, "新名称{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("凭证库已锁定");
    expect(screen.getByRole("textbox", { name: "凭证名称" })).toHaveValue("新名称");
  });

  it("marks RSA credential names as unsafe in the list and detail heading", async () => {
    const user = userEvent.setup();
    mocks.listCredentials.mockResolvedValue([
      { id: "rsa-key", name: "旧服务器私钥", kind: "privateKey", detail: "rsa" },
      { id: "ed-key", name: "现代私钥", kind: "privateKey", detail: "ed25519" },
    ]);
    const { container } = render(<CredentialDialog onClose={vi.fn()}/>);

    const rsaItem = await screen.findByRole("button", { name: /旧服务器私钥.*不安全.*私钥/ });
    const listTag = rsaItem.querySelector(".credential-security-tag")!;
    expect(listTag).toHaveTextContent("不安全");
    expect(screen.getByRole("button", { name: /现代私钥.*私钥/ }).querySelector(".credential-security-tag")).toBeNull();

    await user.hover(listTag);
    const tooltip = screen.getByRole("tooltip");
    expect(container).not.toContainElement(tooltip);
    expect(tooltip).toHaveTextContent("RSA 签名依赖存在未修复的时序侧信道风险");
    expect(tooltip).toHaveTextContent("建议改用 Ed25519 或 ECDSA");
    await user.unhover(listTag);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.click(rsaItem);
    const heading = screen.getByText("旧服务器私钥", { selector: ".credential-editor-heading strong" }).closest("div")!;
    const detailTag = heading.querySelector<HTMLElement>(".credential-security-tag")!;
    expect(detailTag).toHaveTextContent("不安全");
    detailTag.focus();
    expect(screen.getByRole("tooltip")).toHaveTextContent("RSA 签名依赖存在未修复的时序侧信道风险");
  });

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

  it("creates password credentials and allows private key actions before a name is entered", async () => {
    const user = userEvent.setup();
    render(<CredentialDialog onClose={vi.fn()}/>);
    await screen.findByText("生产密码");
    await user.click(screen.getByRole("button", { name: "新建密码" }));
    const passwordName = screen.getByLabelText("凭证名称");
    const password = screen.getByLabelText("密码");
    expect(passwordName).toBeRequired();
    expect(password).toBeRequired();
    expect(passwordName.closest("label")?.querySelector(".required-field-mark")).toBeInTheDocument();
    expect(password.closest("label")?.querySelector(".required-field-mark")).toBeInTheDocument();
    await user.type(passwordName, "新密码");
    await user.type(password, "server-secret");
    await user.click(screen.getByRole("button", { name: "保存凭证" }));
    await waitFor(() => expect(mocks.createPasswordCredential).toHaveBeenCalledWith("新密码", "server-secret"));

    await user.click(screen.getByRole("button", { name: "导入私钥" }));
    const nameInput = screen.getByLabelText("凭证名称");
    expect(nameInput).toBeRequired();
    expect(nameInput.closest("label")?.querySelector(".required-field-mark")).toBeInTheDocument();
    const passphraseInput = screen.getByLabelText("私钥口令（可选）");
    const localChoice = screen.getByRole("button", { name: /拖放私钥文件到这里或点击选择/ });
    const generateChoice = screen.getByRole("button", { name: /生成新私钥/ });
    expect(localChoice).toHaveClass("credential-private-key-dropzone");
    expect(generateChoice).toHaveClass("credential-private-key-generate");
    expect(localChoice.compareDocumentPosition(generateChoice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(localChoice).toBeEnabled();
    expect(generateChoice).toBeEnabled();
    expect(screen.getByRole("button", { name: "保存私钥" })).toBeDisabled();
    await user.type(passphraseInput, "key-secret");
    await user.click(localChoice);
    await waitFor(() => expect(mocks.preparePrivateKeyCredential).toHaveBeenCalledOnce());
    expect(localChoice).toHaveAttribute("aria-pressed", "true");
    expect(localChoice).toHaveTextContent("id_ed25519");
    expect(generateChoice).toBeDisabled();
    expect(mocks.commitPrivateKeyCredential).not.toHaveBeenCalled();
    expect(nameInput).toHaveValue("");
    await user.type(nameInput, "部署私钥");
    const save = screen.getByRole("button", { name: "保存私钥" });
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(mocks.commitPrivateKeyCredential).toHaveBeenCalledWith("draft-file", "部署私钥", "key-secret"));
  });

  it("imports exactly one private key dropped inside the file area and rejects multiple paths", async () => {
    const user = userEvent.setup();
    render(<CredentialDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("button", { name: "导入私钥" }));
    const nameInput = screen.getByLabelText("凭证名称");
    const dropzone = screen.getByRole("button", { name: /拖放私钥文件到这里或点击选择/ });
    vi.spyOn(dropzone, "getBoundingClientRect").mockReturnValue({ left: 10, top: 10, right: 210, bottom: 210, width: 200, height: 200, x: 10, y: 10, toJSON: () => ({}) });
    await waitFor(() => expect(mocks.dragDrop.handler).not.toBeNull());

    act(() => mocks.dragDrop.handler?.({ payload: { type: "drop", paths: ["C:/keys/one", "C:/keys/two"], position: { x: 20, y: 20 } } }));
    expect(mocks.prepareDroppedPrivateKeyCredential).not.toHaveBeenCalled();
    expect(dropzone).toHaveTextContent("一次只能拖入一个私钥文件");

    act(() => mocks.dragDrop.handler?.({ payload: { type: "drop", paths: ["C:/keys/id_ed25519"], position: { x: 20, y: 20 } } }));
    await waitFor(() => expect(mocks.prepareDroppedPrivateKeyCredential).toHaveBeenCalledWith("C:/keys/id_ed25519"));
    expect(nameInput).toHaveValue("");
    expect(dropzone).toHaveAttribute("aria-pressed", "true");
  });

  it("generates an ECDSA P-256 credential in Rust and selects the saved result", async () => {
    const user = userEvent.setup();
    mocks.listCredentials
      .mockResolvedValueOnce([
        { id: "password-1", name: "生产密码", kind: "password", detail: null },
        { id: "key-1", name: "部署私钥", kind: "privateKey", detail: "ed25519" },
      ])
      .mockResolvedValueOnce([
        { id: "password-1", name: "生产密码", kind: "password", detail: null },
        { id: "key-1", name: "部署私钥", kind: "privateKey", detail: "ed25519" },
        { id: "generated-key", name: "新生成私钥", kind: "privateKey", detail: "ecdsa-p256" },
      ]);
    render(<CredentialDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("button", { name: "导入私钥" }));
    const generateChoice = screen.getByRole("button", { name: /生成新私钥/ });
    expect(generateChoice.querySelector('[data-icon="forward"]')).not.toBeInTheDocument();
    await user.click(generateChoice);

    const generateDialog = screen.getByRole("dialog", { name: "生成新私钥" });
    expect(within(generateDialog).getByLabelText("密钥类型")).toHaveValue("ed25519");
    expect(within(generateDialog).getByRole("option", { name: "ECDSA P-384" })).toBeInTheDocument();
    expect(within(generateDialog).getByRole("option", { name: "ECDSA P-521" })).toBeInTheDocument();
    await user.selectOptions(within(generateDialog).getByLabelText("密钥类型"), "ecdsaP256");
    await user.type(within(generateDialog).getByLabelText("公钥注释（可选）"), "deploy@example");
    await user.click(within(generateDialog).getByRole("button", { name: "生成私钥" }));

    await waitFor(() => expect(mocks.prepareGeneratedPrivateKeyCredential).toHaveBeenCalledWith("ecdsaP256", "deploy@example"));
    expect(screen.getByRole("button", { name: /已生成 ECDSA P-256 私钥/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /拖放私钥文件/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存私钥" })).toBeDisabled();
    expect(mocks.commitPrivateKeyCredential).not.toHaveBeenCalled();
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

  it("refreshes the selected private key public key before copying and disables both actions while busy", async () => {
    const user = userEvent.setup();
    render(<CredentialDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("button", { name: /部署私钥私钥/ }));
    await waitFor(() => expect(mocks.getCredentialPublicKey).toHaveBeenCalledOnce());

    const refreshButton = screen.getByRole("button", { name: "重新生成公钥" });
    const copyButton = screen.getByRole("button", { name: "复制公钥" });
    expect(refreshButton.compareDocumentPosition(copyButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    let resolveRefresh!: (value: string) => void;
    mocks.getCredentialPublicKey.mockImplementationOnce(() => new Promise<string>((resolve) => { resolveRefresh = resolve; }));
    await user.click(refreshButton);

    expect(mocks.getCredentialPublicKey).toHaveBeenCalledTimes(2);
    expect(mocks.getCredentialPublicKey).toHaveBeenLastCalledWith("key-1");
    expect(refreshButton).toBeDisabled();
    expect(copyButton).toBeDisabled();
    expect(screen.getByLabelText("OpenSSH 公钥")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("OpenSSH 公钥")).toHaveValue("正在生成公钥…");

    resolveRefresh("ssh-ed25519 AAAARefreshedKey deploy@example");
    await waitFor(() => expect(screen.getByLabelText("OpenSSH 公钥")).toHaveValue("ssh-ed25519 AAAARefreshedKey deploy@example"));
    expect(refreshButton).toBeEnabled();
    expect(copyButton).toBeEnabled();
  });

  it("restores the public key refresh action after a derivation failure", async () => {
    const user = userEvent.setup();
    render(<CredentialDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("button", { name: /部署私钥私钥/ }));
    await waitFor(() => expect(mocks.getCredentialPublicKey).toHaveBeenCalledOnce());

    mocks.getCredentialPublicKey.mockRejectedValueOnce({ message: "无法解析私钥" });
    const refreshButton = screen.getByRole("button", { name: "重新生成公钥" });
    await user.click(refreshButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("无法解析私钥");
    expect(refreshButton).toBeEnabled();
    expect(screen.getByRole("button", { name: "复制公钥" })).toBeDisabled();
    expect(screen.getByLabelText("OpenSSH 公钥")).toHaveValue("暂时无法生成公钥，请点击刷新按钮重试。");
  });
});
