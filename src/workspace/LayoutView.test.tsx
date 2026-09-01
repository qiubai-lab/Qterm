import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import type { GitRepositoryHistoryEntry, Workspace } from "./model";
import type { FileRuntime, GitRuntime, NetworkRuntime, TerminalRuntime } from "./WorkspaceProvider";
import { moveTerminal } from "./layout";

const dispatch = vi.fn();
const splitTerminalBlock = vi.fn();
const selectBlockTarget = vi.fn().mockResolvedValue(undefined);
const selectFileTarget = vi.fn().mockResolvedValue(undefined);
const selectNetworkTarget = vi.fn().mockResolvedValue(undefined);
const selectGitTarget = vi.fn().mockResolvedValue(undefined);
const startNetworkBlockRule = vi.fn().mockResolvedValue(undefined);
const stopNetworkBlockRule = vi.fn().mockResolvedValue(undefined);
const clearBlockBuffer = vi.fn();
const disconnectBlock = vi.fn().mockResolvedValue(undefined);
const disconnectFileBlock = vi.fn().mockResolvedValue(undefined);
const disconnectNetworkBlock = vi.fn().mockResolvedValue(undefined);
const disconnectGitBlock = vi.fn().mockResolvedValue(undefined);
const restartLocalBlock = vi.fn().mockResolvedValue(undefined);
const gitApi = vi.hoisted(() => ({ selectDirectory: vi.fn() }));
const terminalRegistryMocks = vi.hoisted(() => ({ openTerminalSearch: vi.fn().mockReturnValue(true) }));
const profiles = [
  { id: "password-profile", name: "Password Server", host: "password.example", port: 22, username: "root", authPreference: "password" as const, credentialId: null, groupId: null },
  { id: "key-profile", name: "Key Server", host: "key.example", port: 22, username: "deploy", authPreference: "privateKey" as const, credentialId: null, groupId: null },
];
const connectedLocalRuntime = { sessionId: "local-1", kind: "local" as const, status: "connected" as const, hostKeyPrompt: null, notice: "", connectionProgress: null, initialCwd: "C:/launch", cwd: "C:/work", cwdSource: "osc7" as const };
let terminalRuntimes: Record<string, TerminalRuntime> = { "block-1": connectedLocalRuntime };
let fileRuntimes: Record<string, FileRuntime> = {};
let networkRuntimes: Record<string, NetworkRuntime> = {};
let gitRuntimes: Record<string, GitRuntime> = {};
let recentGitRepositories: GitRepositoryHistoryEntry[] = [];
let fileBrowserMountCount = 0;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

vi.mock("../terminal/TerminalPanel", () => ({
  TerminalPanel: () => <div aria-label="测试终端"/>,
}));

vi.mock("../terminal/terminalViewRegistry", () => terminalRegistryMocks);

vi.mock("../files/FileBrowserPane", () => ({
  FileBrowserPane: ({ initialPath }: { initialPath: string }) => {
    const [instance] = useState(() => ++fileBrowserMountCount);
    const [progress, setProgress] = useState(0);
    return <div aria-label="测试文件窗口" data-initial-path={initialPath} data-instance={instance} data-progress={progress}>
      <button onClick={() => setProgress(40)}>测试传输进度</button>
    </div>;
  },
}));

vi.mock("../network/NetworkPane", () => ({
  NetworkPane: ({ onStart }: { onStart?: (rule: { id: string }) => void }) => <button onClick={() => onStart?.({ id: "rule-1" })}>启动测试规则</button>,
}));

vi.mock("../lib/tauri/git", () => ({
  selectGitRepositoryDirectory: gitApi.selectDirectory,
}));

vi.mock("../git/GitRepositoryPickerDialog", () => ({
  GitRepositoryPickerDialog: ({ initialPath, onClose, onSelect }: { initialPath: string; onClose: () => void; onSelect: (path: string) => void }) => <div role="dialog" aria-label="测试远程仓库选择器" data-initial-path={initialPath}>
    <button onClick={() => onSelect("/srv/next")}>测试确认远程目录</button>
    <button onClick={onClose}>测试取消远程目录</button>
  </div>,
}));

vi.mock("../git/GitPane", () => ({
  GitPane: ({ target, onRequestRepositoryChange, onRepositoryOpened }: { target: GitRepositoryHistoryEntry | { type: "unbound" }; onRequestRepositoryChange?: () => void; onRepositoryOpened?: (repository: GitRepositoryHistoryEntry) => void }) => <div aria-label="测试 Git 窗口" data-repository-path={target.type === "unbound" ? "" : target.path}>
    <button onClick={onRequestRepositoryChange}>测试请求更换仓库</button>
    {target.type !== "unbound" && <button onClick={() => onRepositoryOpened?.(target)}>测试报告仓库成功</button>}
  </div>,
}));

vi.mock("./WorkspaceProvider", () => ({
  useWorkspace: () => ({
    document: { schemaVersion: 10, activeWorkspaceId: "workspace-1", recentProfileIds: [], recentGitRepositories, workspaces: [] },
    dispatch,
    splitTerminalBlock,
    runtimes: terminalRuntimes,
    fileRuntimes,
    networkRuntimes,
    gitRuntimes,
    profiles,
    selectBlockTarget,
    selectFileTarget,
    selectNetworkTarget,
    selectGitTarget,
    startNetworkBlockRule,
    stopNetworkBlockRule,
    clearBlockBuffer,
    disconnectBlock,
    disconnectFileBlock,
    disconnectNetworkBlock,
    disconnectGitBlock,
    restartLocalBlock,
  }),
}));

import { WorkspaceCanvas } from "./LayoutView";

const workspace: Workspace = {
  id: "workspace-1",
  name: "Workspace 1",
  activeBlockId: "block-1",
  layout: { type: "terminal", blockId: "block-1", profileId: null, restoreDirectory: null },
};

describe("WorkspaceCanvas terminal actions", () => {
  beforeEach(() => {
    dispatch.mockClear();
    splitTerminalBlock.mockClear();
    selectBlockTarget.mockClear();
    selectFileTarget.mockClear();
    selectNetworkTarget.mockClear();
    startNetworkBlockRule.mockClear();
    stopNetworkBlockRule.mockClear();
    clearBlockBuffer.mockClear();
    disconnectBlock.mockClear();
    disconnectFileBlock.mockClear();
    disconnectNetworkBlock.mockClear();
    restartLocalBlock.mockClear();
    selectGitTarget.mockClear();
    gitApi.selectDirectory.mockReset();
    terminalRegistryMocks.openTerminalSearch.mockClear();
    terminalRuntimes = { "block-1": connectedLocalRuntime };
    fileRuntimes = {};
    networkRuntimes = {};
    gitRuntimes = {};
    recentGitRepositories = [];
    fileBrowserMountCount = 0;
  });
  it("does not expose terminal maximize or restore controls", () => {
    render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    expect(screen.queryByRole("button", { name: /最大化终端|恢复布局/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左右分割" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上下分割" })).toBeInTheDocument();
  });

  it("passes workspace entry attention to the local terminal title", () => {
    render(<WorkspaceCanvas workspace={workspace} visible localTerminalAttention onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    expect(screen.getByText("本地终端", { selector: ".terminal-target-name" })).toHaveClass("local-terminal-attention");
  });

  it("keeps search in the header action group", async () => {
    const user = userEvent.setup();
    render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "搜索终端输出" }));
    expect(terminalRegistryMocks.openTerminalSearch).toHaveBeenCalledWith("block-1");
  });

  it("keeps close persistent and exposes secondary actions through the narrow header menu", async () => {
    const user = userEvent.setup();
    const onRequestClose = vi.fn();
    const splitWorkspace: Workspace = {
      ...workspace,
      layout: {
        type: "split",
        id: "split-1",
        direction: "horizontal",
        ratio: 0.5,
        first: { type: "terminal", blockId: "block-1", profileId: null, restoreDirectory: null },
        second: { type: "terminal", blockId: "block-2", profileId: null, restoreDirectory: null },
      },
    };
    const view = render(<WorkspaceCanvas workspace={splitWorkspace} visible onRequestClose={onRequestClose} onRequestAuthConnection={vi.fn()}/>);
    const block = view.container.querySelector<HTMLElement>('[data-layout-block="block-1"]')!;
    const secondaryActions = block.querySelector(".terminal-header-secondary-actions")!;
    const close = within(block).getByRole("button", { name: "关闭终端" });
    const more = block.querySelector<HTMLButtonElement>(".terminal-header-more")!;

    expect(secondaryActions).not.toContainElement(close);
    expect(close).toHaveClass("terminal-header-close");
    expect(close).toBeEnabled();

    act(() => more.click());
    const menu = await screen.findByRole("menu", { name: "终端更多操作" });
    expect(within(menu).getByRole("menuitem", { name: "搜索终端输出" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "打开仓库管理" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "打开终端文件夹" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "左右分割" }));
    expect(splitTerminalBlock).toHaveBeenCalledWith("workspace-1", "block-1", "horizontal", false);
    expect(screen.queryByRole("menu", { name: "终端更多操作" })).not.toBeInTheDocument();

    act(() => more.click());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(more).toHaveFocus());

    await user.click(close);
    expect(onRequestClose).toHaveBeenCalledWith("block-1");
  });

  it("confirms active disconnects, cancels connecting sessions, and restarts closed local shells", async () => {
    const user = userEvent.setup();
    const onRequestDisconnect = vi.fn();
    const view = render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestDisconnect={onRequestDisconnect} onRequestAuthConnection={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "停止本地终端" }));
    expect(onRequestDisconnect).toHaveBeenCalledWith("terminal", "block-1", "本地终端", true);

    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, sessionId: null, status: "connecting" } };
    view.rerender(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestDisconnect={onRequestDisconnect} onRequestAuthConnection={vi.fn()}/>);
    await user.click(screen.getByRole("button", { name: "取消连接" }));
    expect(disconnectBlock).toHaveBeenCalledWith("block-1");

    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, sessionId: null, status: "closed" } };
    view.rerender(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestDisconnect={onRequestDisconnect} onRequestAuthConnection={vi.fn()}/>);
    await user.click(screen.getByRole("button", { name: "启动本地终端" }));
    expect(restartLocalBlock).toHaveBeenCalledWith("block-1", false);
  });

  it("reconnects a closed remote terminal through configured authentication", async () => {
    const user = userEvent.setup();
    const onRequestAuthConnection = vi.fn();
    const remoteWorkspace: Workspace = { ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } };
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, sessionId: null, kind: "ssh", status: "failed" } };
    render(<WorkspaceCanvas workspace={remoteWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);

    await user.click(screen.getByRole("button", { name: "重新连接" }));
    expect(onRequestAuthConnection).toHaveBeenCalledWith("terminal", "block-1", profiles[0]);
  });

  it("moves a connected remote disconnect into the host summary", async () => {
    const user = userEvent.setup();
    const onRequestDisconnect = vi.fn();
    const remoteWorkspace: Workspace = { ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } };
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, kind: "ssh", status: "connected" } };
    const view = render(<WorkspaceCanvas workspace={remoteWorkspace} visible onRequestClose={vi.fn()} onRequestDisconnect={onRequestDisconnect} onRequestAuthConnection={vi.fn()}/>);

    expect(within(view.container.querySelector(".block-actions")!).queryByRole("button", { name: "断开连接" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /查看 Password Server 主机概要/ }));
    await user.click(screen.getByRole("button", { name: "断开连接" }));
    expect(onRequestDisconnect).toHaveBeenCalledWith("terminal", "block-1", "Password Server", false);
  });

  it("applies disconnect and reconnect lifecycle actions to a remote files window", async () => {
    const user = userEvent.setup();
    const onRequestDisconnect = vi.fn();
    const onRequestAuthConnection = vi.fn();
    const filesWorkspace: Workspace = { ...workspace, layout: { type: "files", blockId: "block-1", profileId: "password-profile", path: "." } };
    fileRuntimes = { "block-1": { sessionId: "files-1", kind: "sftp", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null } };
    const view = render(<WorkspaceCanvas workspace={filesWorkspace} visible onRequestClose={vi.fn()} onRequestDisconnect={onRequestDisconnect} onRequestAuthConnection={onRequestAuthConnection}/>);

    await user.click(screen.getByRole("button", { name: /查看 Password Server 主机概要/ }));
    await user.click(screen.getByRole("button", { name: "断开连接" }));
    expect(onRequestDisconnect).toHaveBeenCalledWith("files", "block-1", "Password Server", false);

    fileRuntimes = { "block-1": { ...fileRuntimes["block-1"], sessionId: null, status: "closed" } };
    view.rerender(<WorkspaceCanvas workspace={filesWorkspace} visible onRequestClose={vi.fn()} onRequestDisconnect={onRequestDisconnect} onRequestAuthConnection={onRequestAuthConnection}/>);
    await user.click(screen.getByRole("button", { name: "重新连接文件" }));
    expect(onRequestAuthConnection).toHaveBeenCalledWith("files", "block-1", profiles[0]);
  });

  it("applies disconnect and reconnect lifecycle actions to a network window", async () => {
    const user = userEvent.setup();
    const onRequestDisconnect = vi.fn();
    const onRequestAuthConnection = vi.fn();
    const networkWorkspace: Workspace = { ...workspace, layout: { type: "network", blockId: "block-1", profileId: "password-profile" } };
    networkRuntimes = { "block-1": { sessionId: "network-1", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null, ruleStates: {} } };
    const view = render(<WorkspaceCanvas workspace={networkWorkspace} visible onRequestClose={vi.fn()} onRequestDisconnect={onRequestDisconnect} onRequestAuthConnection={onRequestAuthConnection}/>);

    await user.click(screen.getByRole("button", { name: /查看 Password Server 主机概要/ }));
    await user.click(screen.getByRole("button", { name: "断开连接" }));
    expect(onRequestDisconnect).toHaveBeenCalledWith("network", "block-1", "Password Server", false);

    networkRuntimes = { "block-1": { ...networkRuntimes["block-1"], sessionId: null, status: "closed" } };
    view.rerender(<WorkspaceCanvas workspace={networkWorkspace} visible onRequestClose={vi.fn()} onRequestDisconnect={onRequestDisconnect} onRequestAuthConnection={onRequestAuthConnection}/>);
    await user.click(screen.getByRole("button", { name: "重新连接网络" }));
    expect(onRequestAuthConnection).toHaveBeenCalledWith("network", "block-1", profiles[0]);
  });

  it("opens connection management from the block target picker", async () => {
    const user = userEvent.setup();
    const onOpenConnectionManager = vi.fn();
    render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()} onOpenConnectionManager={onOpenConnectionManager}/>);

    await user.click(screen.getByRole("button", { name: "选择终端连接，当前：本地终端" }));
    await user.click(screen.getByRole("button", { name: "管理连接…" }));
    expect(onOpenConnectionManager).toHaveBeenCalledOnce();
  });

  it("opens the current terminal directory as an internal files leaf", () => {
    const view = render(<WorkspaceCanvas workspace={workspace} visible remoteShellIntegrationEnabled onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    within(view.container).getByRole("button", { name: "打开终端文件夹" }).click();
    expect(dispatch).toHaveBeenCalledWith({ type: "openFiles", workspaceId: "workspace-1", anchorBlockId: "block-1", profileId: null, path: "C:/work" });
  });

  it("opens repository management for the terminal directory before the folder action", () => {
    const view = render(<WorkspaceCanvas workspace={workspace} visible remoteShellIntegrationEnabled onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    const repository = within(view.container).getByRole("button", { name: "打开仓库管理" });
    const folder = within(view.container).getByRole("button", { name: "打开终端文件夹" });

    expect(repository.querySelector('[data-icon="git"]')).toBeInTheDocument();
    expect(repository.compareDocumentPosition(folder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    repository.click();
    expect(dispatch).toHaveBeenCalledWith({ type: "openGit", workspaceId: "workspace-1", anchorBlockId: "block-1", target: { type: "local", path: "C:/work" } });
  });

  it("opens repository management with the connected remote terminal path", () => {
    const remoteWorkspace: Workspace = { ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } };
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, kind: "ssh", cwd: "/srv/project", cwdSource: "osc7" } };
    const view = render(<WorkspaceCanvas workspace={remoteWorkspace} visible remoteShellIntegrationEnabled onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    within(view.container).getByRole("button", { name: "打开仓库管理" }).click();
    expect(dispatch).toHaveBeenCalledWith({ type: "openGit", workspaceId: "workspace-1", anchorBlockId: "block-1", target: { type: "remote", profileId: "password-profile", path: "/srv/project" } });
  });

  it("automatically highlights a new connected terminal when OSC 7 remains unavailable", () => {
    vi.useFakeTimers();
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, cwd: "C:/launch", cwdSource: "initial" } };
    render(<WorkspaceCanvas workspace={workspace} visible remoteShellIntegrationEnabled onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    expect(screen.getByLabelText("OSC 7 已启用，尚未收到当前会话的目录信息。")).toHaveAttribute("data-state", "waiting");
    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByLabelText("OSC 7 已启用，尚未收到当前会话的目录信息。")).toHaveAttribute("data-state", "waiting");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByLabelText("未检测到本地终端的 OSC 7 当前目录，文件管理将自动回退到启动目录。")).toHaveAttribute("data-state", "attention");
    act(() => vi.advanceTimersByTime(2_500));
    expect(screen.getByLabelText("OSC 7 已启用，尚未收到当前会话的目录信息。")).toHaveAttribute("data-state", "waiting");
  });

  it("opens the local launch directory while showing non-blocking OSC 7 attention", () => {
    vi.useFakeTimers();
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, cwd: "C:/launch", cwdSource: "initial" } };
    const view = render(<WorkspaceCanvas workspace={workspace} visible remoteShellIntegrationEnabled onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    expect(screen.getByLabelText("OSC 7 已启用，尚未收到当前会话的目录信息。")).toHaveAttribute("data-state", "waiting");
    const openDirectory = within(view.container).getByRole("button", { name: "打开终端文件夹" });
    expect(openDirectory).toHaveAttribute("title", "打开启动目录 C:/launch");
    act(() => openDirectory.click());

    const attention = screen.getByLabelText("未检测到本地终端的 OSC 7 当前目录，文件管理将自动回退到启动目录。");
    expect(attention).toHaveAttribute("data-state", "attention");
    expect(attention).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("dialog", { name: "未检测到终端当前目录" })).not.toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledWith({ type: "openFiles", workspaceId: "workspace-1", anchorBlockId: "block-1", profileId: null, path: "C:/launch" });

    act(() => vi.advanceTimersByTime(2_499));
    expect(screen.getByLabelText("未检测到本地终端的 OSC 7 当前目录，文件管理将自动回退到启动目录。")).toHaveAttribute("data-state", "attention");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByLabelText("OSC 7 已启用，尚未收到当前会话的目录信息。")).toHaveAttribute("data-state", "waiting");
  });

  it("routes both split buttons through the context-aware terminal operation", async () => {
    const user = userEvent.setup();
    render(<WorkspaceCanvas workspace={workspace} visible remoteShellIntegrationEnabled onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "左右分割" }));
    await user.click(screen.getByRole("button", { name: "上下分割" }));

    expect(splitTerminalBlock).toHaveBeenNthCalledWith(1, "workspace-1", "block-1", "horizontal", true);
    expect(splitTerminalBlock).toHaveBeenNthCalledWith(2, "workspace-1", "block-1", "vertical", true);
  });

  it("opens the remote home directory without a dialog when OSC 7 is unavailable", () => {
    const remoteWorkspace: Workspace = { ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } };
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, kind: "ssh", cwd: null, cwdSource: null } };
    const view = render(<WorkspaceCanvas workspace={remoteWorkspace} visible remoteShellIntegrationEnabled onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    const openDirectory = within(view.container).getByRole("button", { name: "打开终端文件夹" });
    expect(openDirectory).toHaveAttribute("title", "打开远程主目录");
    act(() => openDirectory.click());

    expect(screen.getByLabelText("未检测到远程终端的 OSC 7 当前目录，文件管理将自动回退到远程主目录。")).toHaveAttribute("data-state", "attention");
    expect(screen.queryByRole("dialog", { name: "未检测到终端当前目录" })).not.toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledWith({ type: "openFiles", workspaceId: "workspace-1", anchorBlockId: "block-1", profileId: "password-profile", path: "." });
  });

  it("shows the enabled OSC 7 tag after the remote host and highlights it only after a directory report", () => {
    const remoteWorkspace: Workspace = { ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } };
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, kind: "ssh", cwd: null, cwdSource: null } };
    const renderCanvas = () => <WorkspaceCanvas workspace={remoteWorkspace} visible remoteShellIntegrationEnabled onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>;
    const view = render(renderCanvas());

    const waiting = screen.getByLabelText("OSC 7 已启用，尚未收到当前会话的目录信息。");
    const endpoint = view.container.querySelector(".terminal-target-endpoint");
    expect(waiting).toHaveTextContent("OSC7");
    expect(waiting.querySelector("span")).toHaveAttribute("aria-hidden", "true");
    expect(waiting).toHaveAttribute("data-state", "waiting");
    expect(waiting).toHaveAttribute("title", "OSC 7 已启用，尚未收到当前会话的目录信息。");
    if (!endpoint) throw new Error("remote endpoint should be rendered");
    expect(endpoint.compareDocumentPosition(waiting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    terminalRuntimes = { "block-1": { ...terminalRuntimes["block-1"], cwd: "/srv/app", cwdSource: "osc7" } };
    view.rerender(renderCanvas());
    const ready = screen.getByLabelText("OSC 7 初始化成功，已开始跟踪当前终端目录。");
    expect(ready).toHaveAttribute("data-state", "ready");
    expect(ready).toHaveAttribute("title", "OSC 7 初始化成功，已开始跟踪当前终端目录。");

    view.rerender(<WorkspaceCanvas workspace={remoteWorkspace} visible remoteShellIntegrationEnabled={false} onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    expect(screen.queryByText("OSC7")).not.toBeInTheDocument();
  });

  it("keeps OSC 7 display and validation disabled while opening the local launch directory", () => {
    vi.useFakeTimers();
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, cwd: "/stale", cwdSource: "osc7" } };
    const view = render(<WorkspaceCanvas workspace={workspace} visible remoteShellIntegrationEnabled={false} onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    expect(screen.queryByText("OSC7")).not.toBeInTheDocument();
    const openDirectory = within(view.container).getByRole("button", { name: "打开终端文件夹" });
    expect(openDirectory).toBeEnabled();
    expect(openDirectory).toHaveAttribute("title", "打开启动目录 C:/launch");
    act(() => openDirectory.click());
    expect(dispatch).toHaveBeenCalledWith({ type: "openFiles", workspaceId: "workspace-1", anchorBlockId: "block-1", profileId: null, path: "C:/launch" });
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByText("OSC7")).not.toBeInTheDocument();
  });

  it("opens the remote home directory when OSC 7 is disabled", () => {
    const remoteWorkspace: Workspace = { ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } };
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, kind: "ssh", initialCwd: null, cwd: null, cwdSource: null } };
    const view = render(<WorkspaceCanvas workspace={remoteWorkspace} visible remoteShellIntegrationEnabled={false} onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    const openDirectory = within(view.container).getByRole("button", { name: "打开终端文件夹" });
    expect(openDirectory).toBeEnabled();
    expect(openDirectory).toHaveAttribute("title", "打开远程主目录");
    openDirectory.click();

    expect(dispatch).toHaveBeenCalledWith({ type: "openFiles", workspaceId: "workspace-1", anchorBlockId: "block-1", profileId: "password-profile", path: "." });
    expect(screen.queryByText("OSC7")).not.toBeInTheDocument();
  });

  it("allows only a remote terminal to create a network leaf inheriting its profile", async () => {
    const user = userEvent.setup();
    const localView = render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    expect(within(localView.container).getByRole("button", { name: "打开网络窗口" })).toBeDisabled();
    localView.unmount();

    const remoteWorkspace: Workspace = { ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } };
    const remoteView = render(<WorkspaceCanvas workspace={remoteWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    await user.click(within(remoteView.container).getByRole("button", { name: "打开网络窗口" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "openNetwork", workspaceId: "workspace-1", anchorBlockId: "block-1", profileId: "password-profile" });
  });

  it("connects a persisted network leaf only when a rule is started", async () => {
    const user = userEvent.setup();
    const onRequestAuthConnection = vi.fn();
    const networkWorkspace: Workspace = { ...workspace, activeBlockId: "network-1", layout: { type: "network", blockId: "network-1", profileId: "password-profile" } };
    const view = render(<WorkspaceCanvas workspace={networkWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    expect(onRequestAuthConnection).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "启动测试规则" }));
    expect(onRequestAuthConnection).toHaveBeenCalledWith("network", "network-1", profiles[0]);

    networkRuntimes = { "network-1": { sessionId: "network-session", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null, ruleStates: {} } };
    view.rerender(<WorkspaceCanvas workspace={networkWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    await waitFor(() => expect(startNetworkBlockRule).toHaveBeenCalledWith("network-1", "rule-1"));
  });

  it("renders a persisted files leaf", () => {
    render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "files-1", layout: { type: "files", blockId: "files-1", profileId: null, path: "C:/work" } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    expect(screen.getByLabelText("测试文件窗口")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭文件窗口" })).toBeInTheDocument();
  });

  it("renders a persisted Git leaf", () => {
    render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "git-1", layout: { type: "git", blockId: "git-1", target: { type: "local", path: "D:/work/project" } } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    expect(screen.getByLabelText("测试 Git 窗口")).toHaveAttribute("data-repository-path", "D:/work/project");
    expect(screen.getByRole("button", { name: "关闭 Git 窗口" })).toBeInTheDocument();
  });

  it("moves local repository history and browsing into the Git block header before close", async () => {
    const user = userEvent.setup();
    gitApi.selectDirectory.mockResolvedValue("D:/work/next");
    const view = render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "git-1", layout: { type: "git", blockId: "git-1", target: { type: "local", path: "D:/work/project" } } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    const choose = screen.getByRole("button", { name: "打开本机仓库" });
    const close = screen.getByRole("button", { name: "关闭 Git 窗口" });
    expect(choose.querySelector('[data-icon="files"]')).not.toBeNull();
    expect(choose.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(choose);
    await user.click(screen.getByRole("button", { name: "浏览其他目录…" }));

    expect(gitApi.selectDirectory).toHaveBeenCalledWith("D:/work/project");
    expect(selectGitTarget).toHaveBeenCalledWith("workspace-1", "git-1", { type: "local", path: "D:/work/next" });
    expect(view.container.querySelector('[data-layout-block="git-1"] .block-actions')).toContainElement(choose);
  });

  it("opens the connected remote repository picker and commits its path once", async () => {
    const user = userEvent.setup();
    gitRuntimes = { "git-1": { sessionId: "git-session", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null, stale: false } };
    render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "git-1", layout: { type: "git", blockId: "git-1", target: { type: "remote", profileId: "password-profile", path: "/srv/project" } } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "打开远程仓库" }));
    await user.click(screen.getByRole("button", { name: "浏览其他目录…" }));
    expect(screen.getByRole("dialog", { name: "测试远程仓库选择器" })).toHaveAttribute("data-initial-path", "/srv/project");
    await user.click(screen.getByRole("button", { name: "测试确认远程目录" }));

    expect(selectGitTarget).toHaveBeenCalledOnce();
    expect(selectGitTarget).toHaveBeenCalledWith("workspace-1", "git-1", { type: "remote", profileId: "password-profile", path: "/srv/next" });
    expect(screen.queryByRole("dialog", { name: "测试远程仓库选择器" })).not.toBeInTheDocument();
  });

  it("remembers a remote picker request until the Git session reconnects", async () => {
    const user = userEvent.setup();
    const onRequestAuthConnection = vi.fn();
    const remoteWorkspace: Workspace = { ...workspace, activeBlockId: "git-1", layout: { type: "git", blockId: "git-1", target: { type: "remote", profileId: "password-profile", path: "/srv/project" } } };
    const view = render(<WorkspaceCanvas workspace={remoteWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    await waitFor(() => expect(onRequestAuthConnection).toHaveBeenCalledWith("git", "git-1", profiles[0]));
    onRequestAuthConnection.mockClear();

    await user.click(screen.getByRole("button", { name: "打开远程仓库" }));
    await user.click(screen.getByRole("button", { name: "浏览其他目录…" }));
    expect(onRequestAuthConnection).toHaveBeenCalledWith("git", "git-1", profiles[0]);
    expect(screen.queryByRole("dialog", { name: "测试远程仓库选择器" })).not.toBeInTheDocument();

    gitRuntimes = { "git-1": { sessionId: "git-session", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null, stale: false } };
    view.rerender(<WorkspaceCanvas workspace={remoteWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    expect(await screen.findByRole("dialog", { name: "测试远程仓库选择器" })).toBeInTheDocument();
  });

  it("opens a recent local repository without invoking the native picker", async () => {
    const user = userEvent.setup();
    recentGitRepositories = [
      { type: "remote", profileId: "password-profile", path: "/srv/private" },
      { type: "local", path: "D:/work/other" },
      { type: "local", path: "D:/work/project" },
    ];
    render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "git-1", layout: { type: "git", blockId: "git-1", target: { type: "local", path: "D:/work/project" } } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "打开本机仓库" }));
    expect(screen.queryByText("/srv/private")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /other/ }));

    expect(gitApi.selectDirectory).not.toHaveBeenCalled();
    expect(selectGitTarget).toHaveBeenCalledWith("workspace-1", "git-1", { type: "local", path: "D:/work/other" });
  });

  it("isolates remote history by profile and preserves its owner when selected", async () => {
    const user = userEvent.setup();
    recentGitRepositories = [
      { type: "remote", profileId: "key-profile", path: "/srv/key-only" },
      { type: "local", path: "D:/work/local" },
      { type: "remote", profileId: "password-profile", path: "/srv/recent" },
    ];
    gitRuntimes = { "git-1": { sessionId: "git-session", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null, stale: false } };
    render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "git-1", layout: { type: "git", blockId: "git-1", target: { type: "remote", profileId: "password-profile", path: "/srv/project" } } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "打开远程仓库" }));
    expect(screen.getByText("/srv/recent")).toBeInTheDocument();
    expect(screen.queryByText("/srv/key-only")).not.toBeInTheDocument();
    expect(screen.queryByText("D:/work/local")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /recent/ }));

    expect(selectGitTarget).toHaveBeenCalledWith("workspace-1", "git-1", { type: "remote", profileId: "password-profile", path: "/srv/recent" });
  });

  it("records only the repository success reported by GitPane", async () => {
    const user = userEvent.setup();
    render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "git-1", layout: { type: "git", blockId: "git-1", target: { type: "local", path: "D:/work/project" } } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "recordRecentGitRepository" }));
    await user.click(screen.getByRole("button", { name: "测试报告仓库成功" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "recordRecentGitRepository", repository: { type: "local", path: "D:/work/project" } });
  });

  it("offers only the newly selected remote profile history before manual path entry", async () => {
    const user = userEvent.setup();
    const onRequestAuthConnection = vi.fn();
    recentGitRepositories = [
      { type: "remote", profileId: "key-profile", path: "/srv/key-only" },
      { type: "remote", profileId: "password-profile", path: "/srv/recent" },
      { type: "local", path: "D:/work/local" },
    ];
    render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "git-1", layout: { type: "git", blockId: "git-1", target: { type: "unbound" } } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);

    await user.click(screen.getByRole("button", { name: /选择Git 连接/ }));
    await user.type(screen.getByRole("searchbox", { name: "搜索Git 连接" }), "Password Server");
    await user.click(screen.getByRole("button", { name: /Password Server/ }));
    expect(screen.getByText("/srv/recent")).toBeInTheDocument();
    expect(screen.queryByText("/srv/key-only")).not.toBeInTheDocument();
    expect(screen.queryByText("D:/work/local")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /recent/ }));
    expect(selectGitTarget).toHaveBeenCalledWith("workspace-1", "git-1", { type: "remote", profileId: "password-profile", path: "/srv/recent" });
    expect(onRequestAuthConnection).toHaveBeenCalledWith("git", "git-1", profiles[0]);
  });

  it("reconnects a persisted remote Git target with its own connection owner", async () => {
    const onRequestAuthConnection = vi.fn();
    render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "git-1", layout: { type: "git", blockId: "git-1", target: { type: "remote", profileId: "password-profile", path: "/srv/project" } } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    await waitFor(() => expect(onRequestAuthConnection).toHaveBeenCalledWith("git", "git-1", profiles[0]));
  });

  it("shows a files connection failure once in the shared lower-right block notice", () => {
    fileRuntimes = {
      "files-1": { sessionId: null, kind: "sftp", status: "failed", hostKeyPrompt: null, notice: "认证被远程主机拒绝", connectionProgress: null },
    };
    const view = render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "files-1", layout: { type: "files", blockId: "files-1", profileId: "password-profile", path: "." } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    const alert = within(view.container).getByRole("alert");
    expect(alert).toHaveClass("block-notice");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("认证被远程主机拒绝");
    expect(view.container.querySelectorAll(".block-notice")).toHaveLength(1);
  });

  it("uses the shared connection route widget in terminal, files, and network blocks", () => {
    const progress = {
      totalNodes: 2, completedNodes: 0, activeNode: 0, phase: "connecting" as const, message: "正在连接节点 1",
      nodes: [
        { index: 0, name: "跳板 1", endpoint: null, role: "jump" as const, state: "active" as const, stage: "connect" as const },
        { index: 1, name: "目标节点", endpoint: null, role: "target" as const, state: "pending" as const, stage: null },
      ],
    };
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, kind: "ssh", status: "connecting", connectionProgress: progress } };
    const view = render(<WorkspaceCanvas workspace={{ ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    expect(screen.getByRole("status")).toHaveTextContent("正在连接节点 1");
    expect(view.container.querySelector(".terminal-block-header > .connection-route-progress")).not.toBeNull();

    fileRuntimes = { "files-1": { sessionId: null, kind: "sftp", status: "connecting", hostKeyPrompt: null, notice: "", connectionProgress: progress } };
    view.rerender(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "files-1", layout: { type: "files", blockId: "files-1", profileId: "password-profile", path: "." } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    expect(screen.getByRole("status")).toHaveTextContent("正在连接节点 1");

    networkRuntimes = { "network-1": { sessionId: null, status: "connecting", hostKeyPrompt: null, notice: "", connectionProgress: progress, ruleStates: {} } };
    view.rerender(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "network-1", layout: { type: "network", blockId: "network-1", profileId: "password-profile" } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    expect(screen.getByRole("status")).toHaveTextContent("正在连接节点 1");
  });

  it("keeps the connected endpoint after the persistent route nodes", () => {
    const progress = {
      totalNodes: 1, completedNodes: 1, activeNode: null, phase: "connected" as const, message: "连接成功",
      nodes: [{ index: 0, name: "Password Server", endpoint: "password.example:22", role: "target" as const, state: "complete" as const, stage: "startSession" as const }],
    };
    terminalRuntimes = { "block-1": { ...connectedLocalRuntime, kind: "ssh", status: "connected", connectionProgress: progress } };
    const view = render(<WorkspaceCanvas workspace={{ ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    const route = view.container.querySelector(".connection-route-progress");
    const dots = route?.querySelector(".connection-route-dots");
    const endpoint = route?.querySelector(".connection-route-endpoint");

    expect(dots).not.toBeNull();
    expect(endpoint).toHaveTextContent("root@password.example");
    if (!dots || !endpoint) throw new Error("route nodes and endpoint should both be rendered");
    expect(dots.compareDocumentPosition(endpoint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.container.querySelector(".terminal-target-menu-icon")).toBeNull();
    expect(view.container.querySelector(".terminal-target>small")).toBeNull();
  });

  it("uses the folder target picker to connect a files-owned SFTP session", async () => {
    const user = userEvent.setup();
    const onRequestAuthConnection = vi.fn();
    const filesWorkspace: Workspace = { ...workspace, activeBlockId: "files-1", layout: { type: "files", blockId: "files-1", profileId: null, path: "C:/work" } };
    const view = render(<WorkspaceCanvas workspace={filesWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    await user.click(within(view.container).getByRole("button", { name: /选择文件连接/ }));
    await user.type(screen.getByRole("searchbox", { name: "搜索文件连接" }), "Password Server");
    await user.click(screen.getByRole("button", { name: /Password Server/ }));
    expect(selectFileTarget).toHaveBeenCalledWith("workspace-1", "files-1", "password-profile");
    expect(onRequestAuthConnection).toHaveBeenCalledWith("files", "files-1", profiles[0]);
  });

  it("requests a configured connection directly for every remote terminal profile", async () => {
    const user = userEvent.setup();
    const onRequestAuthConnection = vi.fn();
    const view = render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    await user.click(within(view.container).getByRole("button", { name: /选择终端连接/ }));
    await user.type(screen.getByRole("searchbox", { name: "搜索终端连接" }), "Password Server");
    await user.click(screen.getByRole("button", { name: /Password Server/ }));
    expect(selectBlockTarget).toHaveBeenCalledWith("workspace-1", "block-1", "password-profile");
    expect(onRequestAuthConnection).toHaveBeenCalledWith("terminal", "block-1", profiles[0]);
    await user.click(within(view.container).getByRole("button", { name: /选择终端连接/ }));
    await user.type(screen.getByRole("searchbox", { name: "搜索终端连接" }), "Key Server");
    await user.click(screen.getByRole("button", { name: /Key Server/ }));
    expect(onRequestAuthConnection).toHaveBeenLastCalledWith("terminal", "block-1", profiles[1]);
  });

  it("automatically requests one independent connection for a persisted remote files leaf", async () => {
    const onRequestAuthConnection = vi.fn();
    const view = render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "files-1", layout: { type: "files", blockId: "files-1", profileId: "password-profile", path: "~" } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    await vi.waitFor(() => expect(onRequestAuthConnection).toHaveBeenCalledWith("files", "files-1", profiles[0]));
    expect(onRequestAuthConnection).toHaveBeenCalledOnce();
    expect(within(view.container).getByLabelText("测试文件窗口")).toHaveAttribute("data-initial-path", ".");
  });

  it("clears the current terminal buffer from the block header", async () => {
    const user = userEvent.setup();
    const view = render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    const button = within(view.container).getByRole("button", { name: "清除终端缓冲区" });
    expect(button.querySelector('[data-icon="clear"]')).not.toBeNull();
    await user.click(button);

    expect(clearBlockBuffer).toHaveBeenCalledWith("block-1");
  });

  it("automatically requests one connection for a persisted remote terminal leaf", async () => {
    terminalRuntimes = {};
    const onRequestAuthConnection = vi.fn();
    render(<WorkspaceCanvas workspace={{ ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile", restoreDirectory: null } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);

    await vi.waitFor(() => expect(onRequestAuthConnection).toHaveBeenCalledWith("terminal", "block-1", profiles[0]));
    expect(onRequestAuthConnection).toHaveBeenCalledOnce();
  });

  it("moves one shared active indicator between terminal and files blocks", async () => {
    const splitWorkspace: Workspace = {
      ...workspace,
      layout: {
        type: "split", id: "split-1", direction: "horizontal", ratio: 0.5,
        first: workspace.layout,
        second: { type: "files", blockId: "files-1", profileId: null, path: "C:/work" },
      },
    };
    const view = render(<WorkspaceCanvas workspace={splitWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    const indicator = view.container.querySelector<HTMLElement>(".active-block-indicator");
    expect(indicator).not.toBeNull();
    await waitFor(() => {
      expect(indicator?.style.left).toBe("0%");
      expect(indicator?.style.top).toBe("0%");
      expect(indicator?.style.width).toBe("calc(50% - 1.5px)");
      expect(indicator?.style.height).toBe("100%");
      expect(indicator?.style.transform).toBe("");
    });

    view.rerender(<WorkspaceCanvas workspace={{ ...splitWorkspace, activeBlockId: "files-1" }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    await waitFor(() => {
      expect(indicator?.style.left).toBe("calc(50% + 1.5px)");
      expect(indicator?.style.top).toBe("0%");
      expect(indicator?.style.width).toBe("calc(50% - 1.5px)");
      expect(indicator?.style.height).toBe("100%");
      expect(indicator?.style.transform).toBe("");
    });
    expect(view.container.querySelectorAll(".active-block-indicator")).toHaveLength(1);
  });

  it("keeps the moving indicator in the workspace coordinate system across nested block sizes", async () => {
    const nestedWorkspace: Workspace = {
      ...workspace,
      layout: {
        type: "split", id: "split-root", direction: "horizontal", ratio: 0.5,
        first: workspace.layout,
        second: {
          type: "split", id: "split-right", direction: "vertical", ratio: 0.5,
          first: { type: "files", blockId: "files-1", profileId: null, path: "C:/work" },
          second: { type: "terminal", blockId: "block-2", profileId: null, restoreDirectory: null },
        },
      },
    };
    const view = render(<WorkspaceCanvas workspace={nestedWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    const indicator = view.container.querySelector<HTMLElement>(".active-block-indicator");

    expect(indicator?.style.left).toBe("0%");
    expect(indicator?.style.top).toBe("0%");
    expect(indicator?.style.width).toBe("calc(50% - 1.5px)");
    expect(indicator?.style.height).toBe("100%");

    view.rerender(<WorkspaceCanvas workspace={{ ...nestedWorkspace, activeBlockId: "block-2" }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    await waitFor(() => {
      expect(indicator?.style.left).toBe("calc(50% + 1.5px)");
      expect(indicator?.style.top).toBe("calc(50% + 1.5px)");
      expect(indicator?.style.width).toBe("calc(50% - 1.5px)");
      expect(indicator?.style.height).toBe("calc(50% - 1.5px)");
      expect(indicator?.style.transform).toBe("");
    });
  });

  it("preserves one files window instance and its in-flight state when another block changes the split ancestry", async () => {
    const user = userEvent.setup();
    const files = { type: "files" as const, blockId: "files-1", profileId: null, path: "C:/work" };
    const network = { type: "network" as const, blockId: "network-1", profileId: null };
    const initialLayout = {
      type: "split" as const, id: "split-root", direction: "horizontal" as const, ratio: 0.4,
      first: workspace.layout,
      second: { type: "split" as const, id: "split-right", direction: "vertical" as const, ratio: 0.5, first: files, second: network },
    };
    const initialWorkspace: Workspace = { ...workspace, activeBlockId: "files-1", layout: initialLayout };
    const view = render(<WorkspaceCanvas workspace={initialWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    const fileBrowser = within(view.container).getByLabelText("测试文件窗口");
    expect(fileBrowser).toHaveAttribute("data-instance", "1");
    await user.click(within(fileBrowser).getByRole("button", { name: "测试传输进度" }));
    expect(fileBrowser).toHaveAttribute("data-progress", "40");

    const movedLayout = moveTerminal(initialLayout, "block-1", "network-1", "bottom", "split-moved");
    view.rerender(<WorkspaceCanvas workspace={{ ...initialWorkspace, layout: movedLayout }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    const movedFileBrowser = within(view.container).getByLabelText("测试文件窗口");
    expect(movedFileBrowser).toBe(fileBrowser);
    expect(movedFileBrowser).toHaveAttribute("data-instance", "1");
    expect(movedFileBrowser).toHaveAttribute("data-progress", "40");
    expect(fileBrowserMountCount).toBe(1);
  });
});
