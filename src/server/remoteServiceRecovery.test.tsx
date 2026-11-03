import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceRuntimeState } from "../workspace/useWorkspaceRuntimeState";
import { useFileWorkspaceController } from "../workspace/useFileWorkspaceController";
import { useGitWorkspaceController } from "../workspace/useGitWorkspaceController";
import { useNetworkWorkspaceController } from "../workspace/useNetworkWorkspaceController";
import { createWorkspaceDocument } from "../workspace/model";
import type { RetainedSession } from "../lib/tauri/runtimeSessions";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { SessionEvent } from "../lib/tauri/sessions";

const transport = vi.hoisted(() => ({ list: vi.fn(), attach: vi.fn(), release: vi.fn(), connect: vi.fn(), close: vi.fn() }));
vi.mock("../lib/runtime/environment", () => ({ isServer: true, hasWorkspaceRuntime: () => true }));
vi.mock("@qterm/services/runtimeSessions", () => ({ listRetainedSessions: transport.list, attachRetainedSession: transport.attach, releaseRetainedBlock: transport.release }));
vi.mock("@qterm/services/sessions", () => ({ connectSession: transport.connect, closeSession: transport.close, acceptHostKey: vi.fn(), rejectHostKey: vi.fn(), writeSession: vi.fn(), resizeSession: vi.fn() }));
vi.mock("@qterm/services/localSessions", () => {
  const capabilities = { windowsPty: null };
  return { getLocalTerminalCapabilities: async () => capabilities };
});
vi.mock("@qterm/services/files", () => ({ connectFileSession: transport.connect }));
vi.mock("@qterm/services/git", () => ({ connectGitSession: transport.connect }));
vi.mock("@qterm/services/network", () => ({ connectNetworkSession: transport.connect, startNetworkRule: vi.fn(), stopNetworkRule: vi.fn() }));
const profile: ConnectionProfile = { id: "remote", name: "Remote", host: "test", port: 22, username: "test", authPreference: "sshAgent", credentialId: null, groupId: null };
const auth = { method: "sshAgent" as const };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(kind: "files" | "git" | "network") {
  const document = createWorkspaceDocument();
  const blockId = document.workspaces[0].activeBlockId;
  const session: RetainedSession = { sessionId: "original-ssh", runtimeKey: blockId, kind, ruleStates: { tunnel: "running" }, profileId: profile.id, status: "connected", cwd: "/work" };
  transport.list.mockResolvedValue([session]);
  const { result } = renderHook(() => {
    const state = useWorkspaceRuntimeState(document, vi.fn());
    const files = useFileWorkspaceController(state, vi.fn());
    const git = useGitWorkspaceController(state, vi.fn());
    const network = useNetworkWorkspaceController(state, vi.fn());
    return { state,
      connect: kind === "files" ? files.connectFileBlock : kind === "git" ? git.connectGitBlock : network.connectNetworkBlock,
      restore: kind === "files" ? files.restoreFileBlock : kind === "git" ? git.restoreGitBlock : network.restoreNetworkBlock,
      disconnect: kind === "files" ? files.disconnectFileBlock : kind === "git" ? git.disconnectGitBlock : network.disconnectNetworkBlock,
      runtime: kind === "files" ? state.fileRuntimes[blockId] : kind === "git" ? state.gitRuntimes[blockId] : state.networkRuntimes[blockId] };

  });
  const connect = () => result.current.connect(blockId, profile, auth);
  const restore = () => result.current.restore(session);
  return { result, blockId, session, connect, restore };
}
beforeEach(() => {
  vi.resetAllMocks();
  transport.close.mockResolvedValue(undefined);
  transport.release.mockResolvedValue(undefined);
  transport.attach.mockImplementation(async (_session, event: (event: SessionEvent) => void) => {
    event({ type: "stateChanged", state: "connected" });
    return "original-ssh";
  });
  transport.connect.mockResolvedValue("new-ssh");
});
afterEach(cleanup);

describe.each(["files", "git", "network"] as const)("%s retained recovery", kind => {
  it.each(["restore", "connect"] as const)("keeps the original SSH task when %s wins the refresh race", async first => {
    const view = setup(kind);
    const pending = deferred<string>();
    transport.attach.mockReturnValue(pending.promise);
    let operation!: Promise<void>;
    await act(async () => {
      operation = first === "restore" ? view.restore() : view.connect();
      await Promise.resolve();
    });
    await act(async () => { await (first === "restore" ? view.connect() : view.restore()); });
    expect(transport.attach).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve("original-ssh"); await operation; });
    await act(view.connect); // Delayed automatic authentication must also leave the restored session alone.
    expect(view.result.current.runtime.sessionId).toBe("original-ssh");
    expect(transport.attach).toHaveBeenCalledTimes(1);
    expect(transport.connect).not.toHaveBeenCalled();
    expect(transport.close).not.toHaveBeenCalled();
    expect(transport.release).not.toHaveBeenCalled();
  });

  it("retries an unsuccessful attachment without replacing the retained process", async () => {
    const view = setup(kind);
    transport.attach.mockRejectedValueOnce(new Error("transport unavailable"));
    await act(view.restore);
    expect(view.result.current.runtime).toMatchObject({ status: "failed", sessionId: null });
    await act(view.connect);
    expect(view.result.current.runtime).toMatchObject({ status: "connected", sessionId: "original-ssh" });
    expect(transport.connect).not.toHaveBeenCalled();
    expect(transport.close).not.toHaveBeenCalled();
    expect(transport.release).not.toHaveBeenCalled();
  });

  it("does not create or delete a process when the retained-session query fails", async () => {
    const view = setup(kind);
    transport.list.mockRejectedValue(new Error("offline"));
    await act(view.connect);
    expect(view.result.current.runtime).toMatchObject({ status: "failed", notice: "offline" });
    expect(transport.connect).not.toHaveBeenCalled();
    expect(transport.close).not.toHaveBeenCalled();
    expect(transport.release).not.toHaveBeenCalled();
  });

  it("creates a new SSH session when no retained session exists", async () => {
    const view = setup(kind);
    transport.list.mockResolvedValue([]);
    await act(view.connect);
    expect(transport.connect).toHaveBeenCalledWith(expect.objectContaining({ runtimeKey: view.blockId, profileId: profile.id }), expect.any(Function));
    expect(view.result.current.runtime.sessionId).toBe("new-ssh");
    expect(transport.close).not.toHaveBeenCalled();
    expect(transport.release).not.toHaveBeenCalled();
  });

  it.each(["closed", "failed"])("replaces a confirmed %s backend session", async status => {
    const view = setup(kind);
    transport.list.mockResolvedValue([{ ...view.session, status }]);
    await act(view.connect);
    expect(transport.close).toHaveBeenCalledExactlyOnceWith("original-ssh");
    expect(transport.connect).toHaveBeenCalledTimes(1);
    expect(transport.attach).not.toHaveBeenCalled();
  });

  it("ignores a lookup that completes after the user disconnects", async () => {
    const view = setup(kind);
    const pending = deferred<RetainedSession[]>();
    transport.list.mockReturnValue(pending.promise);
    let operation!: Promise<void>;
    act(() => { operation = view.connect(); });
    await act(() => view.result.current.disconnect(view.blockId));
    await act(async () => { pending.resolve([view.session]); await operation; });
    expect(transport.attach).not.toHaveBeenCalled();
    expect(transport.connect).not.toHaveBeenCalled();
    expect(transport.release).toHaveBeenCalledExactlyOnceWith(view.blockId);
    expect(view.result.current.runtime.status).toBe("closed");
  });

  it("a stale attachment failure cannot overwrite a newer connection or its reservation", async () => {
    const view = setup(kind);
    const old = deferred<string>();
    const current = deferred<string>();
    transport.attach.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    let restore!: Promise<void>, connect!: Promise<void>;
    act(() => { restore = view.restore(); });
    await act(() => view.result.current.disconnect(view.blockId));
    await act(async () => { connect = view.connect(); await Promise.resolve(); });

    await act(async () => { old.reject(new Error("stale failure")); await restore; });
    expect(view.result.current.runtime).toMatchObject({ status: "connecting", notice: "" });
    await act(view.connect);
    expect(transport.attach).toHaveBeenCalledTimes(2);
    await act(async () => { current.resolve("original-ssh"); await connect; });
  });

  it.each(["closed", "failed"] as const)("does not resurrect a session ID after restoration reports %s", async status => {
    const view = setup(kind);
    transport.attach.mockImplementation(async (_session, event: (event: SessionEvent) => void) => {
      event({ type: "stateChanged", state: status });
      return "original-ssh";
    });
    await act(view.restore);
    expect(view.result.current.runtime).toMatchObject({ status, sessionId: null });
    if (kind === "network") expect(view.result.current.runtime).toMatchObject({ ruleStates: {} });
  });

  it("explicit disconnect still stops the restored backend session", async () => {
    const view = setup(kind);
    await act(view.restore);
    await act(() => view.result.current.disconnect(view.blockId));
    expect(transport.close).toHaveBeenCalledExactlyOnceWith("original-ssh");
  });

  it("rejects mismatched retained targets without deleting them", async () => {
    const view = setup(kind);
    transport.list.mockResolvedValue([{ ...view.session, profileId: "other" }]);
    await act(view.connect);
    expect(view.result.current.runtime.status).toBe("failed");
    expect(transport.close).not.toHaveBeenCalled();
    expect(transport.connect).not.toHaveBeenCalled();
  });
  it("ignores successful attachment results after cancellation", async () => {
    const view = setup(kind);
    const pending = deferred<string>();
    transport.attach.mockReturnValue(pending.promise);
    let operation!: Promise<void>;
    act(() => { operation = view.restore(); });
    await act(() => view.result.current.disconnect(view.blockId));
    await act(async () => { pending.resolve("original-ssh"); await operation; });
    expect(view.result.current.runtime.sessionId).toBeNull();
    expect(transport.close).not.toHaveBeenCalled();
    expect(transport.release).toHaveBeenCalledExactlyOnceWith(view.blockId);
  });
});
it("preserves Network rule state when reconnect attaches a retained session", async () => {
  const view = setup("network");
  await act(view.connect);
  expect(view.result.current.runtime).toMatchObject({ sessionId: "original-ssh", ruleStates: { tunnel: "running" } });
  expect(transport.close).not.toHaveBeenCalled();
});
it("does not copy rule state from a different retained session", async () => {
  const view = setup("network");
  await act(view.connect);
  await act(() => view.result.current.restore({ ...view.session, sessionId: "other-session", ruleStates: {} }));
  expect(view.result.current.runtime).toMatchObject({ sessionId: "original-ssh", ruleStates: { tunnel: "running" } });
});
