import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { Workspace } from "./model";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  connectBlock: vi.fn().mockResolvedValue(undefined),
  connectFileBlock: vi.fn().mockResolvedValue(undefined),
  connectNetworkBlock: vi.fn().mockResolvedValue(undefined),
  resolveConfiguredAuth: vi.fn(),
  getVaultStatus: vi.fn(),
  getProfileRouteRequirements: vi.fn(),
  lockVault: vi.fn(),
  unlockVault: vi.fn(),
  onVaultStatusChanged: vi.fn(),
  getSettings: vi.fn(),
  updateUpdateSettings: vi.fn(),
  checkForUpdateOnStartupOnce: vi.fn(),
  closeCurrentWindow: vi.fn(),
  minimizeCurrentWindow: vi.fn(),
  isCurrentWindowAlwaysOnTop: vi.fn().mockResolvedValue(false),
  setCurrentWindowAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  toggleMaximizeCurrentWindow: vi.fn(),
  isConnectionTargetCurrent: vi.fn().mockReturnValue(true),
  disconnectBlock: vi.fn().mockResolvedValue(undefined),
  disconnectFileBlock: vi.fn().mockResolvedValue(undefined),
  disconnectNetworkBlock: vi.fn().mockResolvedValue(undefined),
  focusTerminalBlock: vi.fn().mockReturnValue(true),
  openTerminalSearch: vi.fn().mockReturnValue(true),
}));

const connectionProfile: ConnectionProfile = { id: "agent-profile", name: "Server", host: "host", port: 22, username: "dev", authPreference: "sshAgent", credentialId: null, groupId: null };
let requestedProfile: ConnectionProfile = connectionProfile;
const initialWorkspace: Workspace = { id: "workspace-1", name: "Workspace 1", activeBlockId: "block-1", layout: { type: "terminal", blockId: "block-1", profileId: null } };
let workspace = initialWorkspace;
let workspaces = [initialWorkspace];

vi.mock("./configuredAuth", () => ({ resolveConfiguredAuth: mocks.resolveConfiguredAuth }));
vi.mock("./LayoutView", () => ({ WorkspaceCanvas: ({ workspace: renderedWorkspace, localTerminalAttention, onRequestAuthConnection, onRequestDisconnect, onOpenConnectionManager }: { workspace: Workspace; localTerminalAttention?: boolean; onRequestAuthConnection: (owner: "terminal", blockId: string, profile: typeof requestedProfile) => void; onRequestDisconnect: (owner: "terminal" | "files" | "network", blockId: string, name: string, local: boolean) => void; onOpenConnectionManager: () => void }) => <div data-testid={`workspace-canvas-${renderedWorkspace.id}`} data-local-terminal-attention={localTerminalAttention || undefined}><div className="terminal-surface"><textarea className="xterm-helper-textarea" aria-label="终端输入"/></div><button onClick={() => onRequestAuthConnection("terminal", "block-1", requestedProfile)}>请求远程连接</button><button onClick={() => onRequestDisconnect("terminal", "block-1", "Server", false)}>请求断开连接</button><button onClick={() => onRequestDisconnect("files", "files-1", "Server Files", false)}>请求断开文件连接</button><button onClick={() => onRequestDisconnect("network", "network-1", "Server Network", false)}>请求断开网络连接</button><button onClick={onOpenConnectionManager}>从连接选择器管理连接</button></div> }));
vi.mock("./WorkspaceProvider", () => ({ useWorkspace: () => ({
  hydrated: true, document: { schemaVersion: 6, activeWorkspaceId: workspace.id, recentProfileIds: [], workspaces }, activeWorkspace: workspace,
  dispatch: mocks.dispatch, runtimes: {}, fileRuntimes: {}, networkRuntimes: {}, connectBlock: mocks.connectBlock, connectFileBlock: mocks.connectFileBlock, connectNetworkBlock: mocks.connectNetworkBlock, disconnectBlock: mocks.disconnectBlock, disconnectFileBlock: mocks.disconnectFileBlock, disconnectNetworkBlock: mocks.disconnectNetworkBlock,
  isConnectionTargetCurrent: mocks.isConnectionTargetCurrent,
  connectedCount: vi.fn().mockReturnValue(0), closeSessions: vi.fn().mockResolvedValue(undefined), blocksForWorkspace: vi.fn().mockReturnValue(["block-1"]),
  acceptBlockHostKey: vi.fn(), rejectBlockHostKey: vi.fn(), acceptFileHostKey: vi.fn(), rejectFileHostKey: vi.fn(), acceptNetworkHostKey: vi.fn(), rejectNetworkHostKey: vi.fn(), storageNotice: "", dismissStorageNotice: vi.fn(),
}) }));
vi.mock("../components/dialogs/ConnectionAuthDialog", () => ({ ConnectionAuthDialog: ({ profile: item }: { profile: typeof connectionProfile }) => <div role="dialog" aria-label={`认证 ${item.name}`}/> }));
vi.mock("../components/dialogs/ConnectionDialog", () => ({ ConnectionDialog: () => <div role="dialog" aria-label="连接管理"/> }));
vi.mock("../components/dialogs/MasterPasswordDialog", () => ({ MasterPasswordDialog: ({ mode, onSuccess }: { mode: string; onSuccess: () => void }) => <div role="dialog" aria-label="解锁凭证库">{mode}<button onClick={onSuccess}>解锁</button></div> }));
vi.mock("../lib/tauri/credentials", () => ({ getVaultStatus: mocks.getVaultStatus, lockVault: mocks.lockVault, unlockVault: mocks.unlockVault, onVaultStatusChanged: mocks.onVaultStatusChanged }));
vi.mock("../lib/tauri/profiles", () => ({ getProfileRouteRequirements: mocks.getProfileRouteRequirements }));
vi.mock("../lib/tauri/settings", () => ({ getSettings: mocks.getSettings, updateUpdateSettings: mocks.updateUpdateSettings }));
vi.mock("../lib/updateCheck", () => ({
  checkForUpdateOnStartupOnce: mocks.checkForUpdateOnStartupOnce,
  checkForUpdate: vi.fn(),
  openLatestReleasePage: vi.fn(),
  updateCheckMessage: () => "无法检查更新。",
}));
vi.mock("../lib/tauri/window", () => ({ closeCurrentWindow: mocks.closeCurrentWindow, currentDesktopPlatform: () => "windows", isCurrentWindowAlwaysOnTop: mocks.isCurrentWindowAlwaysOnTop, minimizeCurrentWindow: mocks.minimizeCurrentWindow, setCurrentWindowAlwaysOnTop: mocks.setCurrentWindowAlwaysOnTop, startDraggingCurrentWindow: vi.fn(), toggleMaximizeCurrentWindow: mocks.toggleMaximizeCurrentWindow }));
vi.mock("../terminal/terminalViewRegistry", () => ({ focusTerminalBlock: mocks.focusTerminalBlock, openTerminalSearch: mocks.openTerminalSearch }));

import { WorkspaceShell } from "./WorkspaceShell";

beforeEach(() => {
  workspace = initialWorkspace;
  workspaces = [initialWorkspace];
  mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: true });
  mocks.getProfileRouteRequirements.mockImplementation(async () => ({
    usesCredential: requestedProfile.authPreference === "password" || requestedProfile.authPreference === "privateKey",
    routeNames: [requestedProfile.name],
  }));
  mocks.lockVault.mockResolvedValue(undefined);
  mocks.unlockVault.mockResolvedValue(undefined);
  mocks.onVaultStatusChanged.mockResolvedValue(() => undefined);
  mocks.getSettings.mockResolvedValue({
    general: { rootDirectory: "", activeRootDirectory: "", dataDirectory: "", deviceDirectory: "", cacheDirectory: "", restartRequired: false },
    security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: null },
    updates: { autoCheckOnStartup: false },
    warning: null,
  });
  mocks.updateUpdateSettings.mockImplementation(async (updates) => ({
    general: { rootDirectory: "", activeRootDirectory: "", dataDirectory: "", deviceDirectory: "", cacheDirectory: "", restartRequired: false },
    security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: null },
    appearance: { theme: "dark" },
    updates,
    warning: null,
  }));
  mocks.checkForUpdateOnStartupOnce.mockResolvedValue(null);
  mocks.isConnectionTargetCurrent.mockReturnValue(true);
  mocks.focusTerminalBlock.mockReturnValue(true);
  mocks.openTerminalSearch.mockReturnValue(true);
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); requestedProfile = connectionProfile; });

describe("WorkspaceShell configured connection routing", () => {
  it("requests local terminal attention on startup and for a newly created workspace", async () => {
    const view = render(<WorkspaceShell/>);

    await waitFor(() => expect(screen.getByTestId("workspace-canvas-workspace-1")).toHaveAttribute("data-local-terminal-attention", "true"));

    const createdWorkspace: Workspace = { id: "workspace-2", name: "Workspace 2", activeBlockId: "block-2", layout: { type: "terminal", blockId: "block-2", profileId: null } };
    workspace = createdWorkspace;
    workspaces = [initialWorkspace, createdWorkspace];
    view.rerender(<WorkspaceShell/>);

    await waitFor(() => expect(screen.getByTestId("workspace-canvas-workspace-2")).toHaveAttribute("data-local-terminal-attention", "true"));
  });

  it("opens the existing connection manager from a block target picker", async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(screen.getByRole("button", { name: "从连接选择器管理连接" }));
    expect(screen.getByRole("dialog", { name: "连接管理" })).toBeInTheDocument();
  });

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

  it("requires vault unlock when an intermediate jump node uses a stored credential", async () => {
    requestedProfile = { ...connectionProfile, jumpProfileIds: ["gateway-1"] };
    mocks.getProfileRouteRequirements.mockResolvedValue({ usesCredential: true, routeNames: ["Gateway", "Server"] });
    mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: false });
    mocks.resolveConfiguredAuth.mockResolvedValue({ method: "sshAgent" });
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(screen.getByRole("button", { name: "请求远程连接" }));

    expect(await screen.findByRole("dialog", { name: "解锁凭证库" })).toBeInTheDocument();
    expect(mocks.connectBlock).not.toHaveBeenCalled();
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

  it("discards configured authentication that resolves after the terminal target changes", async () => {
    let resolveAuth: ((auth: { method: "sshAgent" }) => void) | null = null;
    mocks.resolveConfiguredAuth.mockImplementation(() => new Promise((resolve) => { resolveAuth = resolve; }));
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(screen.getByRole("button", { name: "请求远程连接" }));
    await waitFor(() => expect(mocks.resolveConfiguredAuth).toHaveBeenCalledOnce());
    mocks.isConnectionTargetCurrent.mockReturnValue(false);
    await act(async () => resolveAuth?.({ method: "sshAgent" }));

    expect(mocks.isConnectionTargetCurrent).toHaveBeenCalled();
    expect(mocks.connectBlock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "认证 Server" })).not.toBeInTheDocument();
  });
});

describe("WorkspaceShell utility rail", () => {
  it("breathes the About action for five seconds when startup checking finds an update", async () => {
    vi.useFakeTimers();
    mocks.getSettings.mockResolvedValue({
      general: { rootDirectory: "", activeRootDirectory: "", dataDirectory: "", deviceDirectory: "", cacheDirectory: "", restartRequired: false },
      security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: null },
      appearance: { theme: "dark" },
      updates: { autoCheckOnStartup: true },
      warning: null,
    });
    mocks.checkForUpdateOnStartupOnce.mockResolvedValue({ status: "available", currentVersion: "0.2.3", latestVersion: "0.2.4", publishedAt: null });

    render(<WorkspaceShell/>);
    await act(async () => undefined);

    expect(mocks.checkForUpdateOnStartupOnce).toHaveBeenCalledOnce();
    const about = screen.getByRole("button", { name: "关于，发现新版本 v0.2.4" });
    expect(about).toHaveClass("update-attention");
    expect(document.querySelector(".rail-update-notice")).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByRole("button", { name: "关于" })).not.toHaveClass("update-attention");
  });

  it("opens About from its highlighted action and saves its startup preference", async () => {
    mocks.getSettings.mockResolvedValue({
      general: { rootDirectory: "", activeRootDirectory: "", dataDirectory: "", deviceDirectory: "", cacheDirectory: "", restartRequired: false },
      security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: null },
      appearance: { theme: "dark" },
      updates: { autoCheckOnStartup: true },
      warning: null,
    });
    mocks.checkForUpdateOnStartupOnce.mockResolvedValue({ status: "available", currentVersion: "0.2.3", latestVersion: "0.2.4", publishedAt: null });
    const user = userEvent.setup();

    render(<WorkspaceShell/>);
    await user.click(await screen.findByRole("button", { name: "关于，发现新版本 v0.2.4" }));

    expect(screen.getByRole("dialog", { name: "关于 Qterm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关于" })).not.toHaveClass("update-attention");
    await user.click(screen.getByRole("switch", { name: "启动时自动检测更新" }));
    await waitFor(() => expect(mocks.updateUpdateSettings).toHaveBeenCalledWith({ autoCheckOnStartup: false }));
    expect(screen.getByRole("switch", { name: "启动时自动检测更新" })).toHaveAttribute("aria-checked", "false");
  });

  it("keeps startup update checking disabled by default", async () => {
    render(<WorkspaceShell/>);
    await act(async () => undefined);

    expect(mocks.checkForUpdateOnStartupOnce).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "关于" })).not.toHaveClass("update-attention");
  });

  it("locks the terminal and vault after the configured inactivity deadline", async () => {
    vi.useFakeTimers();
    mocks.getSettings.mockResolvedValue({
      general: { rootDirectory: "", activeRootDirectory: "", dataDirectory: "", deviceDirectory: "", cacheDirectory: "", restartRequired: false },
      security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: 300 },
      updates: { autoCheckOnStartup: false },
      warning: null,
    });
    render(<WorkspaceShell/>);
    await act(async () => undefined);

    await act(async () => { vi.advanceTimersByTime(300_000); });

    expect(mocks.lockVault).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "终端已锁定" })).toBeInTheDocument();
  });

  it("renews terminal inactivity only for user input", async () => {
    vi.useFakeTimers();
    mocks.getSettings.mockResolvedValue({
      general: { rootDirectory: "", activeRootDirectory: "", dataDirectory: "", deviceDirectory: "", cacheDirectory: "", restartRequired: false },
      security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: 300 },
      updates: { autoCheckOnStartup: false },
      warning: null,
    });
    render(<WorkspaceShell/>);
    await act(async () => undefined);

    act(() => vi.advanceTimersByTime(299_000));
    fireEvent.keyDown(window, { key: "Shift" });
    act(() => vi.advanceTimersByTime(299_000));
    fireEvent.pointerDown(window);
    act(() => vi.advanceTimersByTime(299_000));
    fireEvent.wheel(window);
    act(() => vi.advanceTimersByTime(299_000));
    expect(mocks.lockVault).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1_000); });

    expect(mocks.lockVault).toHaveBeenCalledOnce();
  });

  it("checks the absolute inactivity deadline when the window regains focus", async () => {
    vi.useFakeTimers();
    const startedAt = new Date("2026-08-20T00:00:00Z");
    vi.setSystemTime(startedAt);
    mocks.getSettings.mockResolvedValue({
      general: { rootDirectory: "", activeRootDirectory: "", dataDirectory: "", deviceDirectory: "", cacheDirectory: "", restartRequired: false },
      security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: 300 },
      updates: { autoCheckOnStartup: false },
      warning: null,
    });
    render(<WorkspaceShell/>);
    await act(async () => undefined);

    vi.setSystemTime(new Date(startedAt.getTime() + 301_000));
    await act(async () => { fireEvent.focus(window); });

    expect(mocks.lockVault).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "终端已锁定" })).toBeInTheDocument();
  });

  it("does not show a false terminal lock when automatic vault locking fails", async () => {
    vi.useFakeTimers();
    mocks.lockVault.mockRejectedValue(new Error("vault lock failed"));
    mocks.getSettings.mockResolvedValue({
      general: { rootDirectory: "", activeRootDirectory: "", dataDirectory: "", deviceDirectory: "", cacheDirectory: "", restartRequired: false },
      security: { credentialAutoLockAfterSeconds: 3600, terminalAutoLockAfterSeconds: 300 },
      updates: { autoCheckOnStartup: false },
      warning: null,
    });
    render(<WorkspaceShell/>);
    await act(async () => undefined);

    await act(async () => { vi.advanceTimersByTime(300_000); });

    expect(mocks.lockVault).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "终端已锁定" })).not.toBeInTheDocument();
  });

  it("shows the terminal lock action directly above system settings", async () => {
    render(<WorkspaceShell/>);

    expect(screen.getByRole("button", { name: "链接管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "凭证管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文件管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开终端" })).toBeInTheDocument();
    const lockButton = await screen.findByRole("button", { name: "锁定终端" });
    const settingsButton = screen.getByRole("button", { name: "系统设置" });
    expect(lockButton.compareDocumentPosition(settingsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "关于" })).toBeInTheDocument();
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
    fireEvent.keyDown(window, { key: "t", ctrlKey: true, shiftKey: true });
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "addWorkspace" });
    fireEvent.keyDown(window, { key: "1", ctrlKey: true, shiftKey: true });
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "selectWorkspace", workspaceId: "workspace-1" });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true, shiftKey: true });
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
      type: "openFiles", workspaceId: "workspace-1", anchorBlockId: "block-1", profileId: null, path: "~",
    });

    await user.click(screen.getByRole("button", { name: "打开终端" }));
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "splitBlock", workspaceId: "workspace-1", blockId: "block-1", direction: "horizontal",
    });
  });

  it("handles terminal-safe shortcuts while xterm has focus and preserves control keys", () => {
    render(<WorkspaceShell/>);
    const terminalInput = screen.getByRole("textbox", { name: "终端输入" });

    mocks.dispatch.mockClear();
    fireEvent.keyDown(terminalInput, { key: "d", ctrlKey: true });
    expect(mocks.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "splitBlock" }));
    fireEvent.keyDown(terminalInput, { key: "d", ctrlKey: true, shiftKey: true });
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "splitBlock", workspaceId: "workspace-1", blockId: "block-1", direction: "horizontal" });
    fireEvent.keyDown(terminalInput, { key: "f", ctrlKey: true, shiftKey: true });
    expect(mocks.openTerminalSearch).toHaveBeenCalledWith("block-1");
  });

  it("moves terminal focus when the active block changes", async () => {
    const view = render(<WorkspaceShell/>);
    await waitFor(() => expect(mocks.focusTerminalBlock).toHaveBeenCalledWith("block-1"));

    mocks.focusTerminalBlock.mockClear();
    workspace = {
      ...initialWorkspace,
      activeBlockId: "block-2",
      layout: {
        type: "split" as const,
        id: "split-1",
        direction: "horizontal" as const,
        ratio: 0.5,
        first: initialWorkspace.layout,
        second: { type: "terminal" as const, blockId: "block-2", profileId: null },
      },
    };
    view.rerender(<WorkspaceShell/>);
    await waitFor(() => expect(mocks.focusTerminalBlock).toHaveBeenCalledWith("block-2"));

    mocks.dispatch.mockClear();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "终端输入" }), { key: "ArrowLeft", ctrlKey: true, shiftKey: true });
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "selectBlock", workspaceId: "workspace-1", blockId: "block-1" });
  });

  it("confirms before disconnecting an active terminal session", async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell/>);
    await user.click(screen.getByRole("button", { name: "请求断开连接" }));
    expect(screen.getByRole("dialog", { name: "断开“Server”？" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "断开连接" }));
    expect(mocks.disconnectBlock).toHaveBeenCalledWith("block-1");
  });

  it("routes confirmed file and network disconnects to their owning sessions", async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell/>);

    await user.click(screen.getByRole("button", { name: "请求断开文件连接" }));
    expect(screen.getByRole("dialog", { name: "断开“Server Files”？" })).toHaveTextContent("文件窗口和当前路径将保留");
    await user.click(screen.getByRole("button", { name: "断开连接" }));
    expect(mocks.disconnectFileBlock).toHaveBeenCalledWith("files-1");

    await user.click(screen.getByRole("button", { name: "请求断开网络连接" }));
    expect(screen.getByRole("dialog", { name: "断开“Server Network”？" })).toHaveTextContent("网络窗口和规则配置将保留");
    await user.click(screen.getByRole("button", { name: "断开连接" }));
    expect(mocks.disconnectNetworkBlock).toHaveBeenCalledWith("network-1");
  });
});
