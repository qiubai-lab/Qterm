import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useNetworkWorkspaceController } from "./useNetworkWorkspaceController";
import { useWorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { createWorkspaceDocument } from "./model";
import { defaultNetworkRuntime } from "./workspaceRuntime";

const mocks = vi.hoisted(() => ({ close: vi.fn<(id: string) => Promise<void>>() }));
vi.mock("@qterm/services/sessions", () => ({ closeSession: mocks.close, acceptHostKey: vi.fn(), rejectHostKey: vi.fn() }));

it("retains the newest target and runtime when older SSH cleanup finishes last", async () => {
  const finishes: (() => void)[] = [];
  mocks.close.mockImplementation(() => new Promise<void>(resolve => finishes.push(resolve)));
  const dispatch = vi.fn();
  const document = createWorkspaceDocument();
  const hook = renderHook(() => {
    const state = useWorkspaceRuntimeState(document, vi.fn());
    return { state, controller: useNetworkWorkspaceController(state, dispatch) };
  });
  act(() => hook.result.current.state.updateNetworkRuntime("web", () => ({ ...defaultNetworkRuntime, status: "connected", sessionId: "old" })));
  let older!: Promise<void>; let latest!: Promise<void>;
  act(() => { older = hook.result.current.controller.selectNetworkTarget("workspace", "web", "b"); });
  act(() => { latest = hook.result.current.controller.selectNetworkTarget("workspace", "web", "c"); });
  expect(hook.result.current.state.connectionTargetIntents.current.get("network:web")).toBe("c");
  await act(async () => { finishes[1](); await latest; });
  act(() => hook.result.current.state.updateNetworkRuntime("web", () => ({ ...defaultNetworkRuntime, status: "connected", sessionId: "new" })));
  await act(async () => { finishes[0](); await older; });
  expect(hook.result.current.state.networkRuntimes.web.sessionId).toBe("new");
  expect(dispatch.mock.calls.filter(([action]) => action.type === "setNetworkProfile")).toEqual([[{ type: "setNetworkProfile", workspaceId: "workspace", blockId: "web", profileId: "c" }]]);
  expect(mocks.close).toHaveBeenCalledWith("old");
  hook.unmount();
});
