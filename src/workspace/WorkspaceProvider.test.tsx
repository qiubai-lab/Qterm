import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionEvent } from "../lib/tauri/sessions";
import { blockIds, findLeaf } from "./layout";

const mocks = vi.hoisted(() => ({
  connections: [] as Array<{ event: (event: SessionEvent) => void; terminal: (data: Uint8Array) => void }>,
  writers: [vi.fn(), vi.fn()],
  connectSession: vi.fn(),
  connectFileSession: vi.fn(),
  connectNetworkSession: vi.fn(),
  startNetworkRule: vi.fn().mockResolvedValue(undefined),
  stopNetworkRule: vi.fn().mockResolvedValue(undefined),
  closeSession: vi.fn().mockResolvedValue(undefined),
  connectLocalSession: vi.fn(),
  getLocalTerminalCapabilities: vi.fn().mockResolvedValue({ windowsPty: null }),
  closeLocalSession: vi.fn().mockResolvedValue(undefined),
  writeLocalSession: vi.fn().mockResolvedValue(undefined),
  resizeLocalSession: vi.fn().mockResolvedValue(undefined),
  onFailure: vi.fn(),
  unregisterWriters: [] as Array<() => void>,
  clearers: [vi.fn(), vi.fn()],
  terminalSizes: [{ columns: 93, rows: 31 }, { columns: 117, rows: 42 }],
  localConnections: [] as Array<{ event: (event: { type: "stateChanged"; state: "connected" | "closed" }) => void; terminal: (data: Uint8Array) => void }>,
  networkConnections: [] as Array<{ event: (event: SessionEvent) => void }>,
}));

vi.mock("../lib/tauri/profiles", () => ({ listProfiles: vi.fn().mockResolvedValue([]), listProfileGroups: vi.fn().mockResolvedValue([]) }));
vi.mock("../lib/tauri/workspaces", () => ({ loadWorkspaces: vi.fn().mockResolvedValue(null), saveWorkspaces: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/tauri/sessions", () => ({
  connectSession: mocks.connectSession,
  closeSession: mocks.closeSession, writeSession: vi.fn().mockResolvedValue(undefined), resizeSession: vi.fn().mockResolvedValue(undefined),
  acceptHostKey: vi.fn().mockResolvedValue(undefined), rejectHostKey: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/tauri/files", () => ({ connectFileSession: mocks.connectFileSession }));
vi.mock("../lib/tauri/network", () => ({
  connectNetworkSession: mocks.connectNetworkSession,
  startNetworkRule: mocks.startNetworkRule,
  stopNetworkRule: mocks.stopNetworkRule,
}));
vi.mock("../lib/tauri/localSessions", () => ({
  connectLocalSession: mocks.connectLocalSession,
  getLocalTerminalCapabilities: mocks.getLocalTerminalCapabilities,
  closeLocalSession: mocks.closeLocalSession,
  writeLocalSession: mocks.writeLocalSession,
  resizeLocalSession: mocks.resizeLocalSession,
}));

import { WorkspaceProvider, useWorkspace } from "./WorkspaceProvider";

const profile = { id: "profile-1", name: "Server", host: "example.test", port: 22, username: "user", authPreference: "password" as const, credentialId: null, groupId: null };

function Harness() {
  const { document, activeWorkspace, dispatch, splitTerminalBlock, registerWriter, clearBlockBuffer, setBlockCwd, startLocalBlock, connectBlock, connectFileBlock, disconnectFileBlock, connectNetworkBlock, disconnectNetworkBlock, startNetworkBlockRule, selectBlockTarget, selectFileTarget, selectNetworkTarget, writeBlock, resizeBlock, runtimes, fileRuntimes, networkRuntimes } = useWorkspace();
  const ids = blockIds(activeWorkspace.layout);
  const activeLeaf = findLeaf(activeWorkspace.layout, activeWorkspace.activeBlockId);
  return <>
    <output>{ids.length}</output>
    <output data-testid="recent-profiles">{document.recentProfileIds.join(",")}</output>
    <output data-testid="workspace-json">{JSON.stringify(document)}</output>
    <button onClick={() => splitTerminalBlock(activeWorkspace.id, activeWorkspace.activeBlockId, "horizontal")}>split</button>
    <button onClick={() => ids.forEach((id, index) => registerWriter(id, mocks.writers[index], mocks.clearers[index], () => mocks.terminalSizes[index]))}>register</button>
    <button onClick={() => mocks.unregisterWriters.push(registerWriter(ids[0], mocks.writers[0], mocks.clearers[0], () => mocks.terminalSizes[0]))}>register-old-writer</button>
    <button onClick={() => mocks.unregisterWriters.push(registerWriter(ids[0], mocks.writers[1], mocks.clearers[1], () => mocks.terminalSizes[1]))}>register-new-writer</button>
    <button onClick={() => mocks.unregisterWriters[0]?.()}>unregister-old-writer</button>
    <button onClick={() => clearBlockBuffer(ids[0])}>clear-buffer</button>
    <button onClick={() => void startLocalBlock(ids[0], 100, 30)}>local</button>
    <button onClick={() => void startLocalBlock(activeWorkspace.activeBlockId, 100, 30)}>local-active</button>
    <button onClick={() => void selectBlockTarget(activeWorkspace.id, ids[0], profile.id)}>select-remote-target</button>
    <button onClick={() => void selectBlockTarget(activeWorkspace.id, ids[0], null)}>select-local-target</button>
    <button onClick={() => void (async () => { await selectBlockTarget(activeWorkspace.id, ids[0], null); await startLocalBlock(ids[0], 100, 30); })()}>switch-to-local</button>
    <button onClick={() => void writeBlock(ids[0], Uint8Array.from([100, 105, 114, 13]))}>write</button>
    <button onClick={() => void writeBlock(ids[0], Uint8Array.from([27, 91, 49, 59, 49, 82]))}>write-control-response</button>
    <button onClick={() => void resizeBlock(ids[0], 120, 40)}>resize</button>
    <button onClick={() => setBlockCwd(ids[0], "/srv/reported")}>report-cwd</button>
    <button onClick={() => ids.forEach((id) => void connectBlock(id, profile, { method: "password", password: "ephemeral" }))}>connect</button>
    <button onClick={() => void connectBlock(ids[0], profile, { method: "sshAgent" }, mocks.onFailure)}>connect-with-fallback</button>
    <button onClick={() => dispatch({ type: "openFiles", workspaceId: activeWorkspace.id, anchorBlockId: ids[0], profileId: profile.id, path: "/srv" })}>open-files</button>
    <button onClick={() => void connectFileBlock(activeWorkspace.activeBlockId, profile, { method: "password", password: "ephemeral" })}>connect-files</button>
    <button onClick={() => void disconnectFileBlock(activeWorkspace.activeBlockId)}>disconnect-files</button>
    <button onClick={() => void selectFileTarget(activeWorkspace.id, activeWorkspace.activeBlockId, null)}>files-local</button>
    <button onClick={() => void selectFileTarget(activeWorkspace.id, activeWorkspace.activeBlockId, profile.id)}>files-remote</button>
    <button onClick={() => dispatch({ type: "openNetwork", workspaceId: activeWorkspace.id, anchorBlockId: ids[0], profileId: profile.id })}>open-network</button>
    <button onClick={() => void connectNetworkBlock(activeWorkspace.activeBlockId, profile, { method: "sshAgent" })}>connect-network</button>
    <button onClick={() => void disconnectNetworkBlock(activeWorkspace.activeBlockId)}>disconnect-network</button>
    <button onClick={() => void startNetworkBlockRule(activeWorkspace.activeBlockId, "rule-1")}>start-network-rule</button>
    <button onClick={() => void selectNetworkTarget(activeWorkspace.id, activeWorkspace.activeBlockId, null)}>network-clear-target</button>
    <span data-testid="runtime">{runtimes[ids[0]]?.kind}:{runtimes[ids[0]]?.status}</span>
    <span data-testid="runtime-notice">{runtimes[ids[0]]?.notice}</span>
    <span data-testid="runtime-progress">{runtimes[ids[0]]?.connectionProgress?.phase}:{runtimes[ids[0]]?.connectionProgress?.message}</span>
    <span data-testid="runtime-cwd">{runtimes[ids[0]]?.cwd}</span>
    <span data-testid="runtime-cwd-source">{runtimes[ids[0]]?.cwdSource ?? "unknown"}</span>
    <span data-testid="active-profile">{activeLeaf?.profileId ?? "local"}</span>
    <span data-testid="file-runtime">{fileRuntimes[activeWorkspace.activeBlockId]?.kind}:{fileRuntimes[activeWorkspace.activeBlockId]?.status}</span>
    <span data-testid="file-progress">{fileRuntimes[activeWorkspace.activeBlockId]?.connectionProgress?.phase}:{fileRuntimes[activeWorkspace.activeBlockId]?.connectionProgress?.message}</span>
    <span data-testid="file-path">{activeLeaf?.type === "files" ? activeLeaf.path : ""}</span>
    <span data-testid="network-runtime">{networkRuntimes[activeWorkspace.activeBlockId]?.status}:{networkRuntimes[activeWorkspace.activeBlockId]?.ruleStates["rule-1"]}</span>
    <span data-testid="network-progress">{networkRuntimes[activeWorkspace.activeBlockId]?.connectionProgress?.phase}:{networkRuntimes[activeWorkspace.activeBlockId]?.connectionProgress?.message}</span>
  </>;
}

describe("WorkspaceProvider multi-session routing", () => {
  beforeEach(() => {
    mocks.connectSession.mockReset();
    mocks.connectLocalSession.mockReset();
    mocks.connectFileSession.mockReset();
    mocks.connectNetworkSession.mockReset();
    mocks.startNetworkRule.mockClear();
    mocks.stopNetworkRule.mockClear();
    mocks.closeSession.mockReset().mockResolvedValue(undefined);
    mocks.closeLocalSession.mockReset().mockResolvedValue(undefined);
    mocks.writeLocalSession.mockClear();
    mocks.resizeLocalSession.mockClear();
    mocks.onFailure.mockClear();
    mocks.clearers.forEach((clearer) => clearer.mockClear());
    mocks.connections.length = 0;
    mocks.localConnections.length = 0;
    mocks.networkConnections.length = 0;
    mocks.unregisterWriters.length = 0;
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("keeps terminal bytes isolated by stable block id", async () => {
    mocks.connections.length = 0;
    mocks.writers.forEach((writer) => writer.mockClear());
    mocks.connectSession.mockImplementation(async (_input, event, terminal) => {
      mocks.connections.push({ event, terminal });
      return `session-${mocks.connections.length}`;
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);
    await user.click(screen.getByRole("button", { name: "split" }));
    expect(screen.getByText("2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "register" }));
    await user.click(screen.getByRole("button", { name: "connect" }));
    expect(mocks.connections).toHaveLength(2);

    act(() => {
      mocks.connections[0].terminal(Uint8Array.from([65]));
      mocks.connections[1].terminal(Uint8Array.from([66]));
    });
    expect(mocks.writers[0]).toHaveBeenCalledWith(Uint8Array.from([65]));
    expect(mocks.writers[0]).not.toHaveBeenCalledWith(Uint8Array.from([66]));
    expect(mocks.writers[1]).toHaveBeenCalledWith(Uint8Array.from([66]));
  });

  it("starts SSH with the current dimensions registered by the terminal view", async () => {
    mocks.connectSession.mockResolvedValue("ssh-sized");
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "register" }));
    await user.click(screen.getByRole("button", { name: "connect" }));

    expect(mocks.connectSession).toHaveBeenCalledWith(
      {
        profileId: "profile-1",
        auth: { method: "password", password: "ephemeral" },
        terminalSize: { columns: 93, rows: 31 },
      },
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("routes a default local shell independently and closes it before SSH", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: "local-1", cwd: "/Users/tester" };
    });
    mocks.connectSession.mockResolvedValue("ssh-1");
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "register" }));
    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected"));
    expect(mocks.connectLocalSession).toHaveBeenCalledWith(100, 30, expect.any(Function), expect.any(Function), undefined);

    act(() => mocks.localConnections[0].terminal(Uint8Array.from([76])));
    expect(mocks.writers[0]).toHaveBeenCalledWith(Uint8Array.from([76]));
    await user.click(screen.getByRole("button", { name: "write" }));
    await user.click(screen.getByRole("button", { name: "resize" }));
    expect(mocks.writeLocalSession).toHaveBeenCalledWith("local-1", Uint8Array.from([100, 105, 114, 13]));
    expect(mocks.resizeLocalSession).toHaveBeenCalledWith("local-1", 120, 40);

    await user.click(screen.getByRole("button", { name: "connect" }));
    await waitFor(() => expect(mocks.connectSession).toHaveBeenCalledOnce());
    expect(mocks.closeLocalSession).toHaveBeenCalledWith("local-1");
  });

  it("uses the absolute initial directory returned by the local session", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: "local-home", cwd: "/Users/tester" };
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "local" }));

    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected"));
    expect(screen.getByTestId("runtime-cwd")).toHaveTextContent("/Users/tester");
    expect(screen.getByTestId("runtime-cwd-source")).toHaveTextContent("initial");
    await user.click(screen.getByRole("button", { name: "report-cwd" }));
    expect(screen.getByTestId("runtime-cwd")).toHaveTextContent("/srv/reported");
    expect(screen.getByTestId("runtime-cwd-source")).toHaveTextContent("osc7");
  });

  it("inherits the anchor profile and routes its OSC 7 directory only to the new terminal", async () => {
    mocks.connectSession.mockImplementation(async (_input, event, terminal) => {
      mocks.connections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return `ssh-${mocks.connections.length}`;
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "select-remote-target" }));
    await user.click(screen.getByRole("button", { name: "connect" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("ssh:connected"));
    await user.click(screen.getByRole("button", { name: "report-cwd" }));
    await user.click(screen.getByRole("button", { name: "split" }));

    expect(screen.getByTestId("active-profile")).toHaveTextContent("profile-1");
    expect(screen.getByText("2", { selector: "output" })).toBeInTheDocument();

    mocks.connectSession.mockClear();
    await user.click(screen.getByRole("button", { name: "connect" }));
    await waitFor(() => expect(mocks.connectSession).toHaveBeenCalledTimes(2));
    const childInput = mocks.connectSession.mock.calls.find(([input]) => input.initialDirectory === "/srv/reported")?.[0];
    expect(childInput).toMatchObject({ profileId: "profile-1", initialDirectory: "/srv/reported" });
    expect(document.querySelector("[data-testid='active-profile']")).toHaveTextContent("profile-1");
    expect(screen.getByTestId("workspace-json")).not.toHaveTextContent("initialDirectory");
    expect(screen.getByTestId("workspace-json")).not.toHaveTextContent("/srv/reported");

    mocks.connectSession.mockClear();
    await user.click(screen.getByRole("button", { name: "connect" }));
    await waitFor(() => expect(mocks.connectSession).toHaveBeenCalledTimes(2));
    expect(mocks.connectSession.mock.calls.every(([input]) => input.initialDirectory === undefined)).toBe(true);
  });

  it("does not inherit a reported directory from a disconnected source", async () => {
    mocks.connectSession.mockResolvedValue("ssh-normal-directory");
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "select-remote-target" }));
    await user.click(screen.getByRole("button", { name: "report-cwd" }));
    await user.click(screen.getByRole("button", { name: "split" }));
    await user.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => expect(mocks.connectSession).toHaveBeenCalledTimes(2));
    expect(mocks.connectSession.mock.calls.every(([input]) => input.initialDirectory === undefined)).toBe(true);
  });

  it("passes a connected local source OSC 7 directory to only the child PTY", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: `local-${mocks.localConnections.length}`, cwd: "C:/Users/tester" };
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected"));
    await user.click(screen.getByRole("button", { name: "report-cwd" }));
    await user.click(screen.getByRole("button", { name: "split" }));
    await user.click(screen.getByRole("button", { name: "local-active" }));

    await waitFor(() => expect(mocks.connectLocalSession).toHaveBeenCalledTimes(2));
    expect(mocks.connectLocalSession).toHaveBeenLastCalledWith(
      100,
      30,
      expect.any(Function),
      expect.any(Function),
      "/srv/reported",
    );
  });

  it("does not present the remote home fallback as a reported terminal cwd", async () => {
    mocks.connectSession.mockResolvedValue("ssh-cwd-unknown");
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "select-remote-target" }));
    await user.click(screen.getByRole("button", { name: "connect" }));

    expect(screen.getByTestId("runtime-cwd")).toBeEmptyDOMElement();
    expect(screen.getByTestId("runtime-cwd-source")).toHaveTextContent("unknown");
  });

  it("does not let an obsolete SSH request replace the selected local target", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: "local-current", cwd: "/Users/tester" };
    });
    mocks.connectSession.mockResolvedValue("obsolete-ssh");
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "select-remote-target" }));
    await user.click(screen.getByRole("button", { name: "select-local-target" }));
    expect(screen.getByTestId("recent-profiles")).toHaveTextContent("profile-1");
    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected"));
    await user.click(screen.getByRole("button", { name: "connect" }));

    expect(mocks.connectSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected");
  });

  it("does not clear a new local session when closing the previous SSH session finishes late", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    let resolveClose: (() => void) | null = null;
    mocks.connectSession.mockImplementation(async (_input, event, terminal) => {
      mocks.connections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return "ssh-closing-late";
    });
    mocks.closeSession.mockImplementation(() => new Promise<void>((resolve) => { resolveClose = resolve; }));
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: "local-after-late-close", cwd: "/Users/tester" };
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "connect" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("ssh:connected"));
    await user.click(screen.getByRole("button", { name: "select-local-target" }));
    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected"));

    act(() => resolveClose?.());

    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected"));
    expect(screen.getByTestId("runtime-cwd")).toHaveTextContent("/Users/tester");
  });

  it("ignores late SSH failures after switching to a local session", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.connectSession.mockImplementation(async (_input, event, terminal) => {
      mocks.connections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return "ssh-before-late-failure";
    });
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: "local-before-late-failure", cwd: "/Users/tester" };
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "connect-with-fallback" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("ssh:connected"));
    await user.click(screen.getByRole("button", { name: "select-local-target" }));
    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected"));

    act(() => {
      mocks.connections[0].event({ type: "stateChanged", state: "failed" });
      mocks.connections[0].event({ type: "failed", code: "authentication-rejected", message: "认证失败", node: null, stage: null });
    });

    expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected");
    expect(mocks.onFailure).not.toHaveBeenCalled();
  });

  it("starts a fresh local shell and routes its first output after switching from SSH", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.writers[0].mockClear();
    mocks.connectSession.mockImplementation(async (_input, event, terminal) => {
      mocks.connections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return "ssh-before-local";
    });
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: "local-after-ssh", cwd: "/Users/tester" };
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "register" }));
    await user.click(screen.getByRole("button", { name: "connect" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("ssh:connected"));
    await user.click(screen.getByRole("button", { name: "switch-to-local" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected"));
    expect(mocks.closeSession).toHaveBeenCalledWith("ssh-before-local");

    act(() => mocks.localConnections[0].terminal(Uint8Array.from([76, 79, 67, 65, 76])));
    expect(mocks.writers[0]).toHaveBeenCalledWith(Uint8Array.from([76, 79, 67, 65, 76]));
  });

  it("flushes xterm control responses emitted before the local session id returns", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    let resolveConnect: ((connection: { sessionId: string; cwd: string }) => void) | null = null;
    mocks.connectLocalSession.mockImplementation((_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return new Promise<{ sessionId: string; cwd: string }>((resolve) => { resolveConnect = resolve; });
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(mocks.connectLocalSession).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "write" }));
    expect(mocks.writeLocalSession).not.toHaveBeenCalled();

    act(() => resolveConnect?.({ sessionId: "local-pending", cwd: "/Users/tester" }));
    await waitFor(() => expect(mocks.writeLocalSession).toHaveBeenCalledWith("local-pending", Uint8Array.from([100, 105, 114, 13])));
  });

  it("does not drop xterm control responses emitted while buffered local input is flushing", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    let resolveConnect: ((connection: { sessionId: string; cwd: string }) => void) | null = null;
    let resolveFirstWrite: (() => void) | null = null;
    mocks.connectLocalSession.mockImplementation((_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return new Promise<{ sessionId: string; cwd: string }>((resolve) => { resolveConnect = resolve; });
    });
    mocks.writeLocalSession.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirstWrite = resolve; }));
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(mocks.connectLocalSession).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "write" }));
    act(() => resolveConnect?.({ sessionId: "local-flushing", cwd: "/Users/tester" }));
    await waitFor(() => expect(mocks.writeLocalSession).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "write-control-response" }));
    act(() => resolveFirstWrite?.());

    await waitFor(() => expect(mocks.writeLocalSession).toHaveBeenNthCalledWith(2, "local-flushing", Uint8Array.from([27, 91, 49, 59, 49, 82])));
  });

  it("keeps a replacement terminal writer registered when the previous view cleans up", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.writers.forEach((writer) => writer.mockClear());
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: "local-owned", cwd: "/Users/tester" };
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "register-old-writer" }));
    await user.click(screen.getByRole("button", { name: "register-new-writer" }));
    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(mocks.localConnections).toHaveLength(1));
    mocks.clearers.forEach((clearer) => clearer.mockClear());
    await user.click(screen.getByRole("button", { name: "unregister-old-writer" }));
    act(() => mocks.localConnections[0].terminal(Uint8Array.from([80])));
    await user.click(screen.getByRole("button", { name: "clear-buffer" }));

    expect(mocks.writers[1]).toHaveBeenCalledWith(Uint8Array.from([80]));
    expect(mocks.clearers[0]).not.toHaveBeenCalled();
    expect(mocks.clearers[1]).toHaveBeenCalledOnce();
  });

  it("clears the previous terminal buffer before a new SSH session starts", async () => {
    mocks.connectSession.mockResolvedValue("ssh-cleared");
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "register" }));
    await user.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => expect(mocks.connectSession).toHaveBeenCalledOnce());
    expect(mocks.clearers[0]).toHaveBeenCalledOnce();
    expect(mocks.clearers[0]).toHaveBeenCalledWith(true);
    expect(mocks.clearers[0].mock.invocationCallOrder[0]).toBeLessThan(mocks.connectSession.mock.invocationCallOrder[0]);
  });

  it("replays local terminal output produced before a writer is available", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.writers[0].mockClear();
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: "local-buffered", cwd: "/Users/tester" };
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(mocks.localConnections).toHaveLength(1));
    act(() => mocks.localConnections[0].terminal(Uint8Array.from([62, 32])));
    expect(mocks.writers[0]).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "register" }));
    expect(mocks.writers[0]).toHaveBeenCalledWith(Uint8Array.from([62, 32]));
  });

  it("discards buffered output when the terminal target changes", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.writers[0].mockClear();
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return { sessionId: "local-before-switch", cwd: "/Users/tester" };
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(mocks.localConnections).toHaveLength(1));
    act(() => mocks.localConnections[0].terminal(Uint8Array.from([79, 76, 68])));
    await user.click(screen.getByRole("button", { name: "select-remote-target" }));
    await waitFor(() => expect(mocks.closeLocalSession).toHaveBeenCalledWith("local-before-switch"));
    await user.click(screen.getByRole("button", { name: "register" }));

    expect(mocks.writers[0]).not.toHaveBeenCalled();
  });

  it("owns and closes an SFTP session independently for a files block", async () => {
    mocks.connectFileSession.mockImplementation(async (_input, event) => {
      event({ type: "routeProgress", stage: "connect", node: { profileId: "profile-1", name: "Server", host: "example.test", port: 22, index: 1, total: 2, role: "target" } });
      event({ type: "stateChanged", state: "connected" });
      return "files-session-1";
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "open-files" }));
    await user.click(screen.getByRole("button", { name: "connect-files" }));
    await waitFor(() => expect(screen.getByTestId("file-runtime")).toHaveTextContent("sftp:connected"));
    expect(screen.getByTestId("file-progress")).toHaveTextContent("connected:连接成功");
    expect(mocks.connectSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "disconnect-files" }));
    await waitFor(() => expect(screen.getByTestId("file-runtime")).toHaveTextContent("sftp:closed"));
    expect(mocks.closeSession).toHaveBeenCalledWith("files-session-1");
    await user.click(screen.getByRole("button", { name: "connect-files" }));
    await waitFor(() => expect(screen.getByTestId("file-runtime")).toHaveTextContent("sftp:connected"));

    await user.click(screen.getByRole("button", { name: "files-local" }));
    await waitFor(() => expect(mocks.closeSession).toHaveBeenCalledWith("files-session-1"));
    expect(screen.getByTestId("file-runtime")).toHaveTextContent("local:connected");
    expect(screen.getByTestId("file-path")).toHaveTextContent("~");

    await user.click(screen.getByRole("button", { name: "files-remote" }));
    expect(screen.getByTestId("file-runtime")).toHaveTextContent("sftp:closed");
    expect(screen.getByTestId("file-path")).toHaveTextContent(".");
  });

  it("owns Network SSH state per block and closes it before clearing the profile", async () => {
    mocks.connectNetworkSession.mockImplementation(async (_input, event) => {
      mocks.networkConnections.push({ event });
      event({ type: "routeProgress", stage: "connect", node: { profileId: "profile-1", name: "Server", host: "example.test", port: 22, index: 1, total: 2, role: "target" } });
      event({ type: "stateChanged", state: "connected" });
      return "network-session-1";
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "open-network" }));
    await user.click(screen.getByRole("button", { name: "connect-network" }));
    await waitFor(() => expect(screen.getByTestId("network-runtime")).toHaveTextContent("connected"));
    expect(screen.getByTestId("network-progress")).toHaveTextContent("connected:连接成功");
    await user.click(screen.getByRole("button", { name: "start-network-rule" }));
    await waitFor(() => expect(mocks.startNetworkRule).toHaveBeenCalledWith("network-session-1", "rule-1"));
    expect(screen.getByTestId("network-runtime")).toHaveTextContent("connected:running");

    await user.click(screen.getByRole("button", { name: "disconnect-network" }));
    await waitFor(() => expect(screen.getByTestId("network-runtime")).toHaveTextContent("closed"));
    expect(mocks.closeSession).toHaveBeenCalledWith("network-session-1");
    await user.click(screen.getByRole("button", { name: "connect-network" }));
    await waitFor(() => expect(screen.getByTestId("network-runtime")).toHaveTextContent("connected"));

    await user.click(screen.getByRole("button", { name: "network-clear-target" }));
    await waitFor(() => expect(mocks.closeSession).toHaveBeenCalledWith("network-session-1"));
    expect(screen.getByTestId("network-runtime")).toHaveTextContent("closed");
  });

  it("consumes an asynchronous connection failure fallback only once", async () => {
    mocks.connections.length = 0;
    mocks.connectSession.mockImplementation(async (_input, event, terminal) => {
      mocks.connections.push({ event, terminal });
      return "ssh-fallback";
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);
    await user.click(screen.getByRole("button", { name: "connect-with-fallback" }));
    await waitFor(() => expect(mocks.connections).toHaveLength(1));
    act(() => {
      mocks.connections[0].event({ type: "stateChanged", state: "failed" });
      const node = { profileId: "profile-1", name: "Server", host: "example.test", port: 22, index: 0, total: 1, role: "target" as const };
      mocks.connections[0].event({ type: "failed", code: "authentication-rejected", message: "认证失败", node, stage: "authenticate" });
      mocks.connections[0].event({ type: "failed", code: "authentication-rejected", message: "认证失败", node, stage: "authenticate" });
    });
    expect(mocks.onFailure).toHaveBeenCalledOnce();
  });

  it("attributes jump-node failures without opening target authentication fallback", async () => {
    mocks.connections.length = 0;
    mocks.connectSession.mockImplementation(async (_input, event, terminal) => {
      mocks.connections.push({ event, terminal });
      return "ssh-jump-failure";
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);
    await user.click(screen.getByRole("button", { name: "connect-with-fallback" }));
    await waitFor(() => expect(mocks.connections).toHaveLength(1));
    const node = { profileId: "gateway-1", name: "Gateway", host: "gateway.example", port: 22, index: 0, total: 2, role: "jump" as const };
    act(() => {
      mocks.connections[0].event({ type: "failed", code: "jumpTunnelOpenFailed", message: "无法建立下一跳通道", node, stage: "openTunnel" });
    });

    expect(screen.getByTestId("runtime-notice")).toHaveTextContent("跳板“Gateway”（gateway.example:22）：无法建立下一跳通道");
    expect(screen.getByTestId("runtime-progress")).toHaveTextContent("failed:无法建立下一跳通道");
    expect(mocks.onFailure).not.toHaveBeenCalled();
  });

  it("turns jump-route progress into a successful terminal state", async () => {
    mocks.connectSession.mockImplementation(async (_input, event, terminal) => {
      mocks.connections.push({ event, terminal });
      return "ssh-through-jump";
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);
    await user.click(screen.getByRole("button", { name: "connect-with-fallback" }));
    await waitFor(() => expect(mocks.connections).toHaveLength(1));
    const target = { profileId: "profile-1", name: "Server", host: "example.test", port: 22, index: 1, total: 2, role: "target" as const };

    act(() => {
      mocks.connections[0].event({ type: "routeProgress", node: target, stage: "connect" });
    });
    expect(screen.getByTestId("runtime-notice")).toBeEmptyDOMElement();
    expect(screen.getByTestId("runtime-progress")).toHaveTextContent("connecting:正在连接节点 2 · Server");

    act(() => {
      mocks.connections[0].event({ type: "stateChanged", state: "connected" });
    });
    expect(screen.getByTestId("runtime")).toHaveTextContent("ssh:connected");
    expect(screen.getByTestId("runtime-notice")).toBeEmptyDOMElement();
    expect(screen.getByTestId("runtime-progress")).toHaveTextContent("connected:连接成功");
  });
});
