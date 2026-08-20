import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionProfile } from "../lib/tauri/profiles";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  connectBlock: vi.fn().mockResolvedValue(undefined),
  connectFileBlock: vi.fn().mockResolvedValue(undefined),
  connectNetworkBlock: vi.fn().mockResolvedValue(undefined),
  resolveConfiguredAuth: vi.fn(),
  getVaultStatus: vi.fn(),
  lockVault: vi.fn(),
  unlockVault: vi.fn(),
  onVaultStatusChanged: vi.fn(),
  closeCurrentWindow: vi.fn(),
  minimizeCurrentWindow: vi.fn(),
  toggleMaximizeCurrentWindow: vi.fn(),
}));

const connectionProfile: ConnectionProfile = { id: "agent-profile", name: "Server", host: "host", port: 22, username: "dev", authPreference: "sshAgent", credentialId: null, groupId: null };
let requestedProfile: ConnectionProfile = connectionProfile;
const workspace = { id: "workspace-1", name: "Workspace 1", activeBlockId: "block-1", layout: { type: "terminal" as const, blockId: "block-1", profileId: null } };

vi.mock("./configuredAuth", () => ({ resolveConfiguredAuth: mocks.resolveConfiguredAuth }));
vi.mock("./LayoutView", () => ({ WorkspaceCanvas: ({ onRequestAuthConnection }: { onRequestAuthConnection: (owner: "terminal", blockId: string, profile: typeof requestedProfile) => void }) => <button onClick={() => onRequestAuthConnection("terminal", "block-1", requestedProfile)}>请求远程连接</button> }));
vi.mock("./WorkspaceProvider", () => ({ useWorkspace: () => ({
  document: { schemaVersion: 5, activeWorkspaceId: workspace.id, workspaces: [workspace] }, activeWorkspace: workspace,
  dispatch: mocks.dispatch, runtimes: {}, fileRuntimes: {}, networkRuntimes: {}, connectBlock: mocks.connectBlock, connectFileBlock: mocks.connectFileBlock, connectNetworkBlock: mocks.connectNetworkBlock,
  connectedCount: vi.fn().mockReturnValue(0), closeSessions: vi.fn().mockResolvedValue(undefined), blocksForWorkspace: vi.fn().mockReturnValue(["block-1"]),
  acceptBlockHostKey: vi.fn(), rejectBlockHostKey: vi.fn(), acceptFileHostKey: vi.fn(), rejectFileHostKey: vi.fn(), acceptNetworkHostKey: vi.fn(), rejectNetworkHostKey: vi.fn(), storageNotice: "", dismissStorageNotice: vi.fn(),
}) }));
vi.mock("../components/dialogs/ConnectionAuthDialog", () => ({ ConnectionAuthDialog: ({ profile: item }: { profile: typeof connectionProfile }) => <div role="dialog" aria-label={`认证 ${item.name}`}/> }));
vi.mock("../components/dialogs/MasterPasswordDialog", () => ({ MasterPasswordDialog: ({ mode, onSuccess }: { mode: string; onSuccess: () => void }) => <div role="dialog" aria-label="解锁凭证库">{mode}<button onClick={onSuccess}>解锁</button></div> }));
vi.mock("../lib/tauri/credentials", () => ({ getVaultStatus: mocks.getVaultStatus, lockVault: mocks.lockVault, unlockVault: mocks.unlockVault, onVaultStatusChanged: mocks.onVaultStatusChanged }));
vi.mock("../lib/tauri/window", () => ({ closeCurrentWindow: mocks.closeCurrentWindow, minimizeCurrentWindow: mocks.minimizeCurrentWindow, startDraggingCurrentWindow: vi.fn(), toggleMaximizeCurrentWindow: mocks.toggleMaximizeCurrentWindow }));

import { WorkspaceShell } from "./WorkspaceShell";

beforeEach(() => {
  mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: true });
  mocks.lockVault.mockResolvedValue(undefined);
  mocks.unlockVault.mockResolvedValue(undefined);
  mocks.onVaultStatusChanged.mockResolvedValue(() => undefined);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); requestedProfile = connectionProfile; });

describe("WorkspaceShell configured connection routing", () => {
  it("tries configured authentication first and opens the prompt only after failure", async () => {
    mocks.resolveConfiguredAuth.mockResolvedValue({ method: "sshAgent" });
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(screen.getByRole("button", { name: "请求远程连接" }));
    await waitFor(() => expect(mocks.connectBlock).toHaveBeenCalledWith("block-1", connectionProfile, { method: "sshAgent" }, expect.any(Function)));
    expect(screen.queryByRole("dialog", { name: "认证 Server" })).not.toBeInTheDocument();

    const onFailure = mocks.connectBlock.mock.calls[0][3] as () => void;
    act(() => onFailure());
    expect(screen.getByRole("dialog", { name: "认证 Server" })).toBeInTheDocument();
  });

  it("requires the master password before using a referenced credential", async () => {
    requestedProfile = { ...connectionProfile, authPreference: "password", credentialId: "credential-1" };
    mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: false });
    mocks.resolveConfiguredAuth.mockResolvedValue({ method: "storedCredential", credentialId: "credential-1" });
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(screen.getByRole("button", { name: "请求远程连接" }));
    expect(await screen.findByRole("dialog", { name: "解锁凭证库" })).toHaveTextContent("unlock");
    expect(mocks.connectBlock).not.toHaveBeenCalled();
    mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: true });
    await user.click(screen.getByRole("button", { name: "解锁" }));
    await waitFor(() => expect(mocks.connectBlock).toHaveBeenCalledWith("block-1", requestedProfile, { method: "storedCredential", credentialId: "credential-1" }, expect.any(Function)));
  });

  it("opens manual authentication without checking or unlocking the vault", async () => {
    requestedProfile = { ...connectionProfile, authPreference: "manual", credentialId: "must-not-be-used" };
    mocks.resolveConfiguredAuth.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(screen.getByRole("button", { name: "请求远程连接" }));
    expect(await screen.findByRole("dialog", { name: "认证 Server" })).toBeInTheDocument();
    expect(mocks.getVaultStatus).toHaveBeenCalledOnce();
    expect(mocks.connectBlock).not.toHaveBeenCalled();
  });
});

describe("WorkspaceShell utility rail", () => {
  it("shows the terminal lock action directly above system settings", async () => {
    render(<WorkspaceShell/>);

    expect(screen.getByRole("button", { name: "链接管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "凭证管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文件管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开终端" })).toBeInTheDocument();
    const lockButton = await screen.findByRole("button", { name: "锁定终端" });
    const settingsButton = screen.getByRole("button", { name: "系统设置" });
    expect(lockButton.compareDocumentPosition(settingsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "系统帮助" })).toBeInTheDocument();
  });

  it("offers both scopes and can lock only the credential vault", async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(await screen.findByRole("button", { name: "锁定终端" }));
    expect(screen.getByRole("dialog", { name: "锁定终端" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "锁定凭证库" }));

    await waitFor(() => expect(mocks.lockVault).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog", { name: "锁定终端" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "终端已锁定" })).not.toBeInTheDocument();
  });

  it("keeps terminal locking available when backend events report a locked vault", async () => {
    let statusHandler: ((event: { unlocked: boolean; reason: string }) => void) | undefined;
    mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: false });
    mocks.onVaultStatusChanged.mockImplementation(async (handler) => { statusHandler = handler; return () => undefined; });
    render(<WorkspaceShell/>);

    const lockButton = await screen.findByRole("button", { name: "锁定终端" });
    expect(lockButton).toBeEnabled();
    await userEvent.click(lockButton);
    expect(screen.getByRole("button", { name: "锁定凭证库" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "锁定终端和凭证" })).toBeEnabled();
    act(() => statusHandler?.({ unlocked: true, reason: "manual" }));
    expect(screen.getByRole("button", { name: "锁定凭证库" })).toBeEnabled();
  });

  it("keeps the scope dialog open and reports a vault lock failure", async () => {
    mocks.lockVault.mockRejectedValue(new Error("vault lock failed"));
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(await screen.findByRole("button", { name: "锁定终端" }));
    await user.click(screen.getByRole("button", { name: "锁定凭证库" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("vault lock failed");
    expect(screen.getByRole("dialog", { name: "锁定终端" })).toBeInTheDocument();
  });

  it("locks only the workspace stage while keeping workspace and window chrome available", async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(await screen.findByRole("button", { name: "锁定终端" }));
    await user.click(screen.getByRole("button", { name: "锁定终端和凭证" }));

    expect(await screen.findByRole("dialog", { name: "终端已锁定" })).toBeInTheDocument();
    expect(mocks.lockVault).toHaveBeenCalledOnce();
    const shell = document.querySelector("main.app-shell")!;
    const chrome = shell.querySelector(".app-chrome")!;
    const workspaceSurface = shell.querySelector(".workspace-stage-content")!;
    expect(shell).not.toHaveAttribute("inert");
    expect(chrome).not.toHaveAttribute("inert");
    expect(workspaceSurface).toHaveAttribute("inert");
    expect(workspaceSurface).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("dialog", { name: "终端已锁定" })).not.toHaveAttribute("aria-modal");

    await user.click(screen.getByRole("button", { name: "Workspace 1" }));
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "selectWorkspace", workspaceId: "workspace-1" });
    await user.click(screen.getByRole("button", { name: "新建工作区" }));
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "addWorkspace" });
    await user.click(screen.getByRole("button", { name: "最小化窗口" }));
    await user.click(screen.getByRole("button", { name: "最大化或还原窗口" }));
    await user.click(screen.getByRole("button", { name: "关闭窗口" }));
    expect(mocks.minimizeCurrentWindow).toHaveBeenCalledOnce();
    expect(mocks.toggleMaximizeCurrentWindow).toHaveBeenCalledOnce();
    expect(mocks.closeCurrentWindow).toHaveBeenCalledOnce();

    mocks.dispatch.mockClear();
    fireEvent.keyDown(window, { key: "t", ctrlKey: true });
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "addWorkspace" });
    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "selectWorkspace", workspaceId: "workspace-1" });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    expect(mocks.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "splitBlock" }));

    await user.type(screen.getByLabelText("主密码"), "correct-password");
    await user.click(screen.getByRole("button", { name: "解锁终端和凭证" }));

    await waitFor(() => expect(mocks.unlockVault).toHaveBeenCalledWith("correct-password"));
    expect(screen.queryByRole("dialog", { name: "终端已锁定" })).not.toBeInTheDocument();
    expect(workspaceSurface).not.toHaveAttribute("inert");
    expect(workspaceSurface).not.toHaveAttribute("aria-hidden");
  });

  it("does not retain terminal lock state after the application shell remounts", async () => {
    const user = userEvent.setup();
    const view = render(<WorkspaceShell/>);

    await user.click(await screen.findByRole("button", { name: "锁定终端" }));
    await user.click(screen.getByRole("button", { name: "锁定终端和凭证" }));
    expect(await screen.findByRole("dialog", { name: "终端已锁定" })).toBeInTheDocument();

    view.unmount();
    render(<WorkspaceShell/>);

    expect(screen.queryByRole("dialog", { name: "终端已锁定" })).not.toBeInTheDocument();
    expect(document.querySelector(".workspace-stage-content")).not.toHaveAttribute("inert");
  });

  it("opens local files and terminal blocks from the active block", async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(screen.getByRole("button", { name: "文件管理" }));
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "openFiles", workspaceId: "workspace-1", anchorBlockId: "block-1", profileId: null, path: ".",
    });

    await user.click(screen.getByRole("button", { name: "打开终端" }));
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "splitBlock", workspaceId: "workspace-1", blockId: "block-1", direction: "horizontal",
    });
  });
});
