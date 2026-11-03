import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createWorkspaceDocument } from "./model";
import { useWorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { useWorkspaceRuntimeController } from "./useWorkspaceRuntimeController";
import { detachRuntime } from "../remoteRuntime/switchGuard";
import { runRuntimeSwitch } from "../remoteRuntime/switchOperation";

const native = vi.hoisted(() => ({ close: vi.fn(), vault: vi.fn(), lock: vi.fn() }));
vi.mock("../lib/runtime/environment", () => ({ isServer: false, hasWorkspaceRuntime: () => true }));
vi.mock("@qterm/services/localSessions", () => ({
  getLocalTerminalCapabilities: async () => ({ windowsPty: null }),
  connectLocalSession: async () => ({ sessionId: "local-before-switch", cwd: "~" }),
  closeLocalSession: native.close,
  resizeLocalSession: vi.fn(), writeLocalSession: vi.fn(),
}));
vi.mock("@qterm/services/credentials", () => ({ getVaultStatus: native.vault, lockVault: native.lock }));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each(["deferred", "immediate"])("commits the remote switch once with %s native close completion", async completion => {
  const document = createWorkspaceDocument();
  const dispatch = vi.fn(); const notice = vi.fn();
  let finishClose!: () => void;
  let finishVault!: () => void;
  native.close.mockImplementation(() => completion === "immediate"
    ? Promise.resolve()
    : new Promise<void>(resolve => { finishClose = resolve; }));
  native.vault.mockImplementation(() => new Promise(resolve => {
    finishVault = () => resolve({ initialized: true, unlocked: true });
  }));
  native.lock.mockResolvedValue(undefined);
  const { result, unmount } = renderHook(() => {
    const state = useWorkspaceRuntimeState(document, notice);
    return useWorkspaceRuntimeController(state, document, dispatch);
  });
  const blockId = document.workspaces[0].activeBlockId;
  await act(() => result.current.startLocalBlock(blockId, 80, 24, false));
  const commit = vi.fn();
  let switching!: Promise<void>;
  act(() => {
    switching = runRuntimeSwitch([{ label: "关闭本机会话", run: detachRuntime }], vi.fn(), commit, 2000);
  });
  // Attach the rejection handler before yielding to the renderer.
  const completed = switching.then(() => null, error => error);
  try {
    await waitFor(() => expect(native.close).toHaveBeenCalledWith("local-before-switch"));
    expect(commit).not.toHaveBeenCalled();
    await act(async () => { finishClose?.(); });
    await waitFor(() => expect(native.vault).toHaveBeenCalledOnce());
    expect(commit).not.toHaveBeenCalled();
    await act(async () => { finishVault(); });
    expect(await completed).toBeNull();
    expect(native.close).toHaveBeenCalledOnce();
    expect(native.vault).toHaveBeenCalledOnce();
    expect(native.lock).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
  } finally {
    unmount(); finishClose?.(); finishVault?.(); await completed;
  }
});
