import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Workspace } from "./model";

const dispatch = vi.fn();
const selectBlockTarget = vi.fn().mockResolvedValue(undefined);
const selectFileTarget = vi.fn().mockResolvedValue(undefined);
const selectNetworkTarget = vi.fn().mockResolvedValue(undefined);
const startNetworkBlockRule = vi.fn().mockResolvedValue(undefined);
const stopNetworkBlockRule = vi.fn().mockResolvedValue(undefined);
const clearBlockBuffer = vi.fn();
const profiles = [
  { id: "password-profile", name: "Password Server", host: "password.example", port: 22, username: "root", authPreference: "password" as const, credentialId: null, groupId: null },
  { id: "key-profile", name: "Key Server", host: "key.example", port: 22, username: "deploy", authPreference: "privateKey" as const, credentialId: null, groupId: null },
];
const connectedLocalRuntime = { sessionId: "local-1", kind: "local" as const, status: "connected" as const, hostKeyPrompt: null, notice: "", cwd: "C:/work" };
let terminalRuntimes: Record<string, typeof connectedLocalRuntime> = { "block-1": connectedLocalRuntime };
let networkRuntimes: Record<string, { sessionId: string | null; status: "closed" | "connected"; hostKeyPrompt: null; notice: string; ruleStates: Record<string, "stopped" | "running"> }> = {};

vi.mock("../terminal/TerminalPanel", () => ({
  TerminalPanel: () => <div aria-label="测试终端"/>,
}));

vi.mock("../files/FileBrowserPane", () => ({
  FileBrowserPane: ({ initialPath }: { initialPath: string }) => <div aria-label="测试文件窗口" data-initial-path={initialPath}/>,
}));

vi.mock("../network/NetworkPane", () => ({
  NetworkPane: ({ onStart }: { onStart?: (rule: { id: string }) => void }) => <button onClick={() => onStart?.({ id: "rule-1" })}>启动测试规则</button>,
}));

vi.mock("./WorkspaceProvider", () => ({
  useWorkspace: () => ({
    dispatch,
    runtimes: terminalRuntimes,
    fileRuntimes: {},
    networkRuntimes,
    profiles,
    selectBlockTarget,
    selectFileTarget,
    selectNetworkTarget,
    startNetworkBlockRule,
    stopNetworkBlockRule,
    clearBlockBuffer,
  }),
}));

import { WorkspaceCanvas } from "./LayoutView";

const workspace: Workspace = {
  id: "workspace-1",
  name: "Workspace 1",
  activeBlockId: "block-1",
  layout: { type: "terminal", blockId: "block-1", profileId: null },
};

describe("WorkspaceCanvas terminal actions", () => {
  beforeEach(() => {
    dispatch.mockClear();
    selectBlockTarget.mockClear();
    selectFileTarget.mockClear();
    selectNetworkTarget.mockClear();
    startNetworkBlockRule.mockClear();
    stopNetworkBlockRule.mockClear();
    clearBlockBuffer.mockClear();
    terminalRuntimes = { "block-1": connectedLocalRuntime };
    networkRuntimes = {};
  });
  it("does not expose terminal maximize or restore controls", () => {
    render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);

    expect(screen.queryByRole("button", { name: /最大化终端|恢复布局/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左右分割" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上下分割" })).toBeInTheDocument();
  });

  it("opens the current terminal directory as an internal files leaf", () => {
    const view = render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    within(view.container).getByRole("button", { name: "打开当前文件夹" }).click();
    expect(dispatch).toHaveBeenCalledWith({ type: "openFiles", workspaceId: "workspace-1", anchorBlockId: "block-1", profileId: null, path: "C:/work" });
  });

  it("allows only a remote terminal to create a network leaf inheriting its profile", async () => {
    const user = userEvent.setup();
    const localView = render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    expect(within(localView.container).getByRole("button", { name: "打开网络窗口" })).toBeDisabled();
    localView.unmount();

    const remoteWorkspace: Workspace = { ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile" } };
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

    networkRuntimes = { "network-1": { sessionId: "network-session", status: "connected", hostKeyPrompt: null, notice: "", ruleStates: {} } };
    view.rerender(<WorkspaceCanvas workspace={networkWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    await waitFor(() => expect(startNetworkBlockRule).toHaveBeenCalledWith("network-1", "rule-1"));
  });

  it("renders a persisted files leaf", () => {
    render(<WorkspaceCanvas workspace={{ ...workspace, activeBlockId: "files-1", layout: { type: "files", blockId: "files-1", profileId: null, path: "C:/work" } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    expect(screen.getByLabelText("测试文件窗口")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭文件窗口" })).toBeInTheDocument();
  });

  it("uses the folder target picker to connect a files-owned SFTP session", async () => {
    const user = userEvent.setup();
    const onRequestAuthConnection = vi.fn();
    const filesWorkspace: Workspace = { ...workspace, activeBlockId: "files-1", layout: { type: "files", blockId: "files-1", profileId: null, path: "C:/work" } };
    const view = render(<WorkspaceCanvas workspace={filesWorkspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    await user.click(within(view.container).getByRole("button", { name: /选择文件连接/ }));
    await user.click(within(view.container).getByRole("menuitemradio", { name: /Password Server/ }));
    expect(selectFileTarget).toHaveBeenCalledWith("workspace-1", "files-1", "password-profile");
    expect(onRequestAuthConnection).toHaveBeenCalledWith("files", "files-1", profiles[0]);
  });

  it("requests a configured connection directly for every remote terminal profile", async () => {
    const user = userEvent.setup();
    const onRequestAuthConnection = vi.fn();
    const view = render(<WorkspaceCanvas workspace={workspace} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);
    await user.click(within(view.container).getByRole("button", { name: /选择终端连接/ }));
    await user.click(within(view.container).getByRole("menuitemradio", { name: /Password Server/ }));
    expect(selectBlockTarget).toHaveBeenCalledWith("workspace-1", "block-1", "password-profile");
    expect(onRequestAuthConnection).toHaveBeenCalledWith("terminal", "block-1", profiles[0]);
    await user.click(within(view.container).getByRole("button", { name: /选择终端连接/ }));
    await user.click(within(view.container).getByRole("menuitemradio", { name: /Key Server/ }));
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
    render(<WorkspaceCanvas workspace={{ ...workspace, layout: { type: "terminal", blockId: "block-1", profileId: "password-profile" } }} visible onRequestClose={vi.fn()} onRequestAuthConnection={onRequestAuthConnection}/>);

    await vi.waitFor(() => expect(onRequestAuthConnection).toHaveBeenCalledWith("terminal", "block-1", profiles[0]));
    expect(onRequestAuthConnection).toHaveBeenCalledOnce();
  });

  it("moves one shared active indicator between terminal and files blocks", async () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("workspace-canvas")) return domRect(0, 0, 600, 400);
      if (this.dataset.layoutBlock === "block-1") return domRect(2, 2, 296, 396);
      if (this.dataset.layoutBlock === "files-1") return domRect(302, 2, 296, 396);
      return domRect(0, 0, 0, 0);
    });
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
      expect(indicator?.style.transform).toBe("translate3d(2px, 2px, 0)");
      expect(indicator?.style.width).toBe("296px");
      expect(indicator?.style.height).toBe("396px");
    });

    view.rerender(<WorkspaceCanvas workspace={{ ...splitWorkspace, activeBlockId: "files-1" }} visible onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>);
    await waitFor(() => {
      expect(indicator?.style.transform).toBe("translate3d(302px, 2px, 0)");
      expect(indicator?.style.width).toBe("296px");
      expect(indicator?.style.height).toBe("396px");
    });
    expect(view.container.querySelectorAll(".active-block-indicator")).toHaveLength(1);
    bounds.mockRestore();
  });
});

function domRect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x, toJSON: () => ({}) };
}
