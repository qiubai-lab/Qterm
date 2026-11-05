import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceRuntimeState } from "../workspace/useWorkspaceRuntimeState";
import { useTerminalWorkspaceController } from "../workspace/useTerminalWorkspaceController";
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
const profile: ConnectionProfile = { id: "remote", name: "Remote", host: "test", port: 22, username: "test", authPreference: "sshAgent", credentialId: null, groupId: null };
const auth = { method: "sshAgent" as const };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const document = createWorkspaceDocument();
  const blockId = document.workspaces[0].activeBlockId;
  const session: RetainedSession = { sessionId: "original-ssh", runtimeKey: blockId, kind: "terminal", profileId: profile.id, status: "connected", cwd: "/work" };
  transport.list.mockResolvedValue([session]);
  const { result } = renderHook(() => {
    const state = useWorkspaceRuntimeState(document, vi.fn());
    return { state, terminal: useTerminalWorkspaceController(state, vi.fn()) };
  });
  const connect = () => result.current.terminal.connectBlock(blockId, profile, auth);
  const restore = () => result.current.terminal.restoreTerminalBlock(session);
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

it.each(["restore", "connect"] as const)("keeps the original SSH task when %s wins the refresh race", async first => {
  const view = setup();
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
  expect(view.result.current.state.runtimes[view.blockId].sessionId).toBe("original-ssh");
  expect(transport.attach).toHaveBeenCalledTimes(1);
  expect(transport.connect).not.toHaveBeenCalled();
  expect(transport.close).not.toHaveBeenCalled();
  expect(transport.release).not.toHaveBeenCalled();
});

it("retries an unsuccessful attachment without replacing the retained process", async () => {
  const view = setup();
  transport.attach.mockRejectedValueOnce(new Error("transport unavailable"));
  await act(view.restore);
  expect(view.result.current.state.runtimes[view.blockId]).toMatchObject({ status: "failed", sessionId: null });
  await act(view.connect);
  expect(view.result.current.state.runtimes[view.blockId]).toMatchObject({ status: "connected", sessionId: "original-ssh" });
  expect(transport.connect).not.toHaveBeenCalled();
  expect(transport.close).not.toHaveBeenCalled();
  expect(transport.release).not.toHaveBeenCalled();
});

it("does not create or delete a process when the retained-session query fails", async () => {
  const view = setup();
  transport.list.mockRejectedValue(new Error("offline"));
  await act(view.connect);
  expect(view.result.current.state.runtimes[view.blockId]).toMatchObject({ status: "failed", notice: "offline" });
  expect(transport.connect).not.toHaveBeenCalled();
  expect(transport.close).not.toHaveBeenCalled();
  expect(transport.release).not.toHaveBeenCalled();
});

it("creates a new SSH session when no retained session exists", async () => {
  const view = setup();
  transport.list.mockResolvedValue([]);
  await act(view.connect);
  expect(transport.connect).toHaveBeenCalledWith(expect.objectContaining({ runtimeKey: view.blockId, profileId: profile.id }), expect.any(Function), expect.any(Function));
  expect(view.result.current.state.runtimes[view.blockId].sessionId).toBe("new-ssh");
  expect(transport.close).not.toHaveBeenCalled();
  expect(transport.release).not.toHaveBeenCalled();
});

it.each(["closed", "failed"])("replaces a confirmed %s backend session", async status => {
  const view = setup();
  transport.list.mockResolvedValue([{ ...view.session, status }]);
  await act(view.connect);
  expect(transport.close).toHaveBeenCalledExactlyOnceWith("original-ssh");
  expect(transport.connect).toHaveBeenCalledTimes(1);
  expect(transport.attach).not.toHaveBeenCalled();
});

it("ignores a lookup that completes after the user disconnects", async () => {
  const view = setup();
  const pending = deferred<RetainedSession[]>();
  transport.list.mockReturnValue(pending.promise);
  let operation!: Promise<void>;
  act(() => { operation = view.connect(); });
  await act(() => view.result.current.terminal.disconnectBlock(view.blockId));
  await act(async () => { pending.resolve([view.session]); await operation; });
  expect(transport.attach).not.toHaveBeenCalled();
  expect(transport.connect).not.toHaveBeenCalled();
  expect(transport.release).toHaveBeenCalledExactlyOnceWith(view.blockId);
  expect(view.result.current.state.runtimes[view.blockId].status).toBe("closed");
});

it("a stale attachment failure cannot overwrite a newer connection or its reservation", async () => {
  const view = setup();
  const old = deferred<string>();
  const current = deferred<string>();
  transport.attach.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  let restore!: Promise<void>, connect!: Promise<void>;
  act(() => { restore = view.restore(); });
  await act(() => view.result.current.terminal.disconnectBlock(view.blockId));
  await act(async () => { connect = view.connect(); await Promise.resolve(); });
  const epoch = view.result.current.state.startingLocal.current.get(view.blockId);
  await act(async () => { old.reject(new Error("stale failure")); await restore; });
  expect(view.result.current.state.runtimes[view.blockId]).toMatchObject({ status: "connecting", notice: "" });
  expect(view.result.current.state.startingLocal.current.get(view.blockId)).toBe(epoch);
  await act(async () => { current.resolve("original-ssh"); await connect; });
});

it("does not resurrect a session ID after a restored terminal reports failure", async () => {
  const view = setup();
  transport.attach.mockImplementation(async (_session, event: (event: SessionEvent) => void) => {
    event({ type: "stateChanged", state: "failed" });
    return "original-ssh";
  });
  await act(view.restore);
  expect(view.result.current.state.runtimes[view.blockId]).toMatchObject({ status: "failed", sessionId: null });
});

it("explicit disconnect still stops the restored backend session", async () => {
  const view = setup();
  await act(view.restore);
  await act(() => view.result.current.terminal.disconnectBlock(view.blockId));
  expect(transport.close).toHaveBeenCalledExactlyOnceWith("original-ssh");
});

it("retains changed-key details through failure for explicit recovery", async () => {
  const view = setup();
  const change: SessionEvent = { type: "hostKeyChanged", node: { profileId: "jump", name: "Jump", host: "jump.example", port: 2222, index: 0, total: 2, role: "jump" }, trustedFingerprint: "SHA256:old", presentedFingerprint: "SHA256:new" };
  transport.attach.mockImplementation(async (_session, event: (event: SessionEvent) => void) => {
    event(change);
    event({ type: "failed", code: "hostKeyChanged", message: "主机密钥已变化，连接已阻断", node: change.node, stage: "verifyHostKey" });
    event({ type: "stateChanged", state: "failed" });
    return "original-ssh";
  });
  await act(view.restore);
  expect(view.result.current.state.runtimes[view.blockId]).toMatchObject({ status: "failed", sessionId: null, hostKeyChange: change });
});
