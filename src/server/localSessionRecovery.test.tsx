import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceRuntimeState } from "../workspace/useWorkspaceRuntimeState";
import { useTerminalWorkspaceController } from "../workspace/useTerminalWorkspaceController";
import { createWorkspaceDocument } from "../workspace/model";

const transport = vi.hoisted(() => ({ list: vi.fn(), release: vi.fn(), connect: vi.fn(), close: vi.fn(), closeLocal: vi.fn() }));
vi.mock("../lib/runtime/environment", () => ({ isServer: true, hasWorkspaceRuntime: () => true }));
vi.mock("@qterm/services/runtimeSessions", () => ({ listRetainedSessions: transport.list, releaseRetainedBlock: transport.release, attachRetainedSession: vi.fn() }));
vi.mock("@qterm/services/sessions", () => ({ closeSession: transport.close }));
vi.mock("@qterm/services/localSessions", () => {
  const capabilities = { windowsPty: null };
  return { getLocalTerminalCapabilities: async () => capabilities, connectLocalSession: transport.connect, closeLocalSession: transport.closeLocal, writeLocalSession: vi.fn() };
});
function setup() {
  const document = createWorkspaceDocument();
  const blockId = document.workspaces[0].activeBlockId;
  const session = { sessionId: "original-local", runtimeKey: blockId, kind: "local", profileId: null, status: "connected", cwd: "/work" };
  transport.list.mockResolvedValue([session]);
  const { result } = renderHook(() => {
    const state = useWorkspaceRuntimeState(document, vi.fn());
    return { state, terminal: useTerminalWorkspaceController(state, vi.fn()) };
  });
  const start = () => result.current.terminal.startLocalBlock(blockId, 80, 24, true);
  const retry = () => result.current.terminal.restartLocalBlock(blockId, true);
  return { result, blockId, session, start, retry };
}
beforeEach(() => {
  vi.resetAllMocks();
  transport.close.mockResolvedValue(undefined);
  transport.closeLocal.mockResolvedValue(undefined);
  transport.release.mockResolvedValue(undefined);
  transport.connect.mockResolvedValue({ sessionId: "original-local", cwd: "/work" });
});
afterEach(cleanup);

it("reattaches the same local process after a failed browser attachment", async () => {
  const view = setup();
  transport.connect.mockRejectedValueOnce(new Error("transport unavailable"));
  await act(view.start);
  expect(view.result.current.state.runtimes[view.blockId].status).toBe("failed");
  await act(view.retry);
  expect(view.result.current.state.runtimes[view.blockId]).toMatchObject({ status: "connected", sessionId: "original-local" });
  expect(transport.connect).toHaveBeenLastCalledWith(80, 24, expect.any(Function), expect.any(Function), true, undefined, view.blockId);
  expect(transport.close).not.toHaveBeenCalled();
  expect(transport.closeLocal).not.toHaveBeenCalled();
  expect(transport.release).not.toHaveBeenCalled();
});
it("does not create or delete a local process when session lookup fails", async () => {
  const view = setup();
  transport.list.mockRejectedValue(new Error("offline"));
  await act(view.retry);
  expect(view.result.current.state.runtimes[view.blockId]).toMatchObject({ status: "failed", notice: "offline" });
  expect(transport.connect).not.toHaveBeenCalled();
  expect(transport.release).not.toHaveBeenCalled();
});
it.each(["closed", "failed"])("replaces a local session only after confirming it is %s", async status => {
  const view = setup();
  transport.list.mockResolvedValue([{ ...view.session, status }]);
  await act(view.retry);
  expect(transport.close).toHaveBeenCalledExactlyOnceWith("original-local");
  expect(transport.connect).toHaveBeenCalledOnce();
});
it("creates a local shell when the registry has no retained process", async () => {
  const view = setup();
  transport.list.mockResolvedValue([]);
  await act(view.retry);
  expect(transport.connect).toHaveBeenCalledOnce();
  expect(transport.close).not.toHaveBeenCalled();
});
it("coalesces automatic start and manual retry while lookup is pending", async () => {
  const view = setup();
  let resolve!: (sessions: typeof view.session[]) => void;
  transport.list.mockReturnValue(new Promise<typeof view.session[]>(done => { resolve = done; }));
  let start!: Promise<void>;
  act(() => { start = view.start(); });
  await act(view.retry);
  await act(async () => { resolve([view.session]); await start; });
  expect(transport.list).toHaveBeenCalledOnce();
  expect(transport.connect).toHaveBeenCalledOnce();
  expect(transport.close).not.toHaveBeenCalled();
});
it("does not reopen after disconnect during retained-session lookup", async () => {
  const view = setup();
  let resolve!: (sessions: typeof view.session[]) => void;
  transport.list.mockReturnValue(new Promise<typeof view.session[]>(done => { resolve = done; }));
  let start!: Promise<void>;
  act(() => { start = view.start(); });
  await act(() => view.result.current.terminal.disconnectBlock(view.blockId));
  await act(async () => { resolve([view.session]); await start; });
  expect(transport.connect).not.toHaveBeenCalled();
  expect(transport.release).toHaveBeenCalledExactlyOnceWith(view.blockId);
});
it("explicit stop still closes the local backend process", async () => {
  const view = setup();
  await act(view.start);
  await act(() => view.result.current.terminal.disconnectBlock(view.blockId));
  expect(transport.closeLocal).toHaveBeenCalledExactlyOnceWith("original-local");
});
