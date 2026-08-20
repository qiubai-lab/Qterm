import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionEvent } from "../lib/tauri/sessions";
import { blockIds } from "./layout";

const mocks = vi.hoisted(() => ({
  connections: [] as Array<{ event: (event: SessionEvent) => void; terminal: (data: Uint8Array) => void }>,
  writers: [vi.fn(), vi.fn()],
  connectSession: vi.fn(),
  connectFileSession: vi.fn(),
  closeSession: vi.fn().mockResolvedValue(undefined),
  connectLocalSession: vi.fn(),
  getLocalTerminalCapabilities: vi.fn().mockResolvedValue({ windowsPty: null }),
  closeLocalSession: vi.fn().mockResolvedValue(undefined),
  writeLocalSession: vi.fn().mockResolvedValue(undefined),
  resizeLocalSession: vi.fn().mockResolvedValue(undefined),
  onFailure: vi.fn(),
  unregisterWriters: [] as Array<() => void>,
  clearers: [vi.fn(), vi.fn()],
  localConnections: [] as Array<{ event: (event: { type: "stateChanged"; state: "connected" | "closed" }) => void; terminal: (data: Uint8Array) => void }>,
}));

vi.mock("../lib/tauri/profiles", () => ({ listProfiles: vi.fn().mockResolvedValue([]) }));
vi.mock("../lib/tauri/workspaces", () => ({ loadWorkspaces: vi.fn().mockResolvedValue(null), saveWorkspaces: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/tauri/sessions", () => ({
  connectSession: mocks.connectSession,
  closeSession: mocks.closeSession, writeSession: vi.fn().mockResolvedValue(undefined), resizeSession: vi.fn().mockResolvedValue(undefined),
  acceptHostKey: vi.fn().mockResolvedValue(undefined), rejectHostKey: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/tauri/files", () => ({ connectFileSession: mocks.connectFileSession }));
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
  const { activeWorkspace, dispatch, registerWriter, clearBlockBuffer, startLocalBlock, connectBlock, connectFileBlock, selectBlockTarget, selectFileTarget, writeBlock, resizeBlock, runtimes, fileRuntimes } = useWorkspace();
  const ids = blockIds(activeWorkspace.layout);
  return <>
    <output>{ids.length}</output>
    <button onClick={() => dispatch({ type: "splitBlock", workspaceId: activeWorkspace.id, blockId: activeWorkspace.activeBlockId, direction: "horizontal" })}>split</button>
    <button onClick={() => ids.forEach((id, index) => registerWriter(id, mocks.writers[index], mocks.clearers[index]))}>register</button>
    <button onClick={() => mocks.unregisterWriters.push(registerWriter(ids[0], mocks.writers[0], mocks.clearers[0]))}>register-old-writer</button>
    <button onClick={() => mocks.unregisterWriters.push(registerWriter(ids[0], mocks.writers[1], mocks.clearers[1]))}>register-new-writer</button>
    <button onClick={() => mocks.unregisterWriters[0]?.()}>unregister-old-writer</button>
    <button onClick={() => clearBlockBuffer(ids[0])}>clear-buffer</button>
    <button onClick={() => void startLocalBlock(ids[0], 100, 30)}>local</button>
    <button onClick={() => void selectBlockTarget(activeWorkspace.id, ids[0], profile.id)}>select-remote-target</button>
    <button onClick={() => void (async () => { await selectBlockTarget(activeWorkspace.id, ids[0], null); await startLocalBlock(ids[0], 100, 30); })()}>switch-to-local</button>
    <button onClick={() => void writeBlock(ids[0], Uint8Array.from([100, 105, 114, 13]))}>write</button>
    <button onClick={() => void writeBlock(ids[0], Uint8Array.from([27, 91, 49, 59, 49, 82]))}>write-control-response</button>
    <button onClick={() => void resizeBlock(ids[0], 120, 40)}>resize</button>
    <button onClick={() => ids.forEach((id) => void connectBlock(id, profile, { method: "password", password: "ephemeral" }))}>connect</button>
    <button onClick={() => void connectBlock(ids[0], profile, { method: "sshAgent" }, mocks.onFailure)}>connect-with-fallback</button>
    <button onClick={() => dispatch({ type: "openFiles", workspaceId: activeWorkspace.id, anchorBlockId: ids[0], profileId: profile.id, path: "/srv" })}>open-files</button>
    <button onClick={() => void connectFileBlock(activeWorkspace.activeBlockId, profile, { method: "password", password: "ephemeral" })}>connect-files</button>
    <button onClick={() => void selectFileTarget(activeWorkspace.id, activeWorkspace.activeBlockId, null)}>files-local</button>
    <span data-testid="runtime">{runtimes[ids[0]]?.kind}:{runtimes[ids[0]]?.status}</span>
    <span data-testid="file-runtime">{fileRuntimes[activeWorkspace.activeBlockId]?.kind}:{fileRuntimes[activeWorkspace.activeBlockId]?.status}</span>
  </>;
}

describe("WorkspaceProvider multi-session routing", () => {
  beforeEach(() => {
    mocks.connectSession.mockReset();
    mocks.connectLocalSession.mockReset();
    mocks.connectFileSession.mockReset();
    mocks.closeSession.mockClear();
    mocks.closeLocalSession.mockClear();
    mocks.writeLocalSession.mockClear();
    mocks.resizeLocalSession.mockClear();
    mocks.onFailure.mockClear();
    mocks.clearers.forEach((clearer) => clearer.mockClear());
    mocks.connections.length = 0;
    mocks.localConnections.length = 0;
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

  it("routes a default local shell independently and closes it before SSH", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.connectLocalSession.mockImplementation(async (_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return "local-1";
    });
    mocks.connectSession.mockResolvedValue("ssh-1");
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "register" }));
    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("local:connected"));
    expect(mocks.connectLocalSession).toHaveBeenCalledWith(100, 30, expect.any(Function), expect.any(Function));

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
      return "local-after-ssh";
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
    let resolveConnect: ((sessionId: string) => void) | null = null;
    mocks.connectLocalSession.mockImplementation((_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return new Promise<string>((resolve) => { resolveConnect = resolve; });
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(mocks.connectLocalSession).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "write" }));
    expect(mocks.writeLocalSession).not.toHaveBeenCalled();

    act(() => resolveConnect?.("local-pending"));
    await waitFor(() => expect(mocks.writeLocalSession).toHaveBeenCalledWith("local-pending", Uint8Array.from([100, 105, 114, 13])));
  });

  it("does not drop xterm control responses emitted while buffered local input is flushing", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    let resolveConnect: ((sessionId: string) => void) | null = null;
    let resolveFirstWrite: (() => void) | null = null;
    mocks.connectLocalSession.mockImplementation((_columns, _rows, event, terminal) => {
      mocks.localConnections.push({ event, terminal });
      event({ type: "stateChanged", state: "connected" });
      return new Promise<string>((resolve) => { resolveConnect = resolve; });
    });
    mocks.writeLocalSession.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirstWrite = resolve; }));
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "local" }));
    await waitFor(() => expect(mocks.connectLocalSession).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "write" }));
    act(() => resolveConnect?.("local-flushing"));
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
      return "local-owned";
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
      return "local-buffered";
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
      return "local-before-switch";
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
      event({ type: "stateChanged", state: "connected" });
      return "files-session-1";
    });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Harness/></WorkspaceProvider>);

    await user.click(screen.getByRole("button", { name: "open-files" }));
    await user.click(screen.getByRole("button", { name: "connect-files" }));
    await waitFor(() => expect(screen.getByTestId("file-runtime")).toHaveTextContent("sftp:connected"));
    expect(mocks.connectSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "files-local" }));
    await waitFor(() => expect(mocks.closeSession).toHaveBeenCalledWith("files-session-1"));
    expect(screen.getByTestId("file-runtime")).toHaveTextContent("local:connected");
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
      mocks.connections[0].event({ type: "failed", code: "authentication-rejected", message: "认证失败" });
      mocks.connections[0].event({ type: "failed", code: "authentication-rejected", message: "认证失败" });
    });
    expect(mocks.onFailure).toHaveBeenCalledOnce();
  });
});
