import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ServerRuntimeRestore } from "./ServerRuntimeRestore";
const state = vi.hoisted(() => ({
  hydrated: true,
  document: {workspaces: [{layout: {type:"split",id:"split",direction:"horizontal",ratio:0.5,first:{type:"git",blockId:"git-block",target:{type:"remote",profileId:"profile"}},second:{type:"network",blockId:"network-block",profileId:"profile"}}}]},
  restoreTerminalBlock:vi.fn(),restoreFileBlock:vi.fn(),restoreGitBlock:vi.fn(),restoreNetworkBlock:vi.fn(),
}));
const activity = vi.hoisted(() => ({ enabled: true }));
vi.mock("../workspace/workbenchActivity", () => ({ useWorkbenchActive: () => activity.enabled }));
const list = vi.hoisted(() => vi.fn());
vi.mock("../workspace/WorkspaceProvider", () => ({useWorkspace:()=>state}));
vi.mock("./services/runtimeSessions", () => ({listRetainedSessions:list}));
const originalDocument = state.document;
beforeEach(() => { vi.resetAllMocks(); state.hydrated = true; state.document = originalDocument; activity.enabled = true; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("reattaches the original Git and network sessions, including running rules", async () => {
  const git={sessionId:"old-git",runtimeKey:"git-block",kind:"git",profileId:"profile"};
  const network={sessionId:"old-network",runtimeKey:"network-block",kind:"network",profileId:"profile",ruleStates:{rule:"running"}};
  list.mockResolvedValue([git,network]);
  render(<ServerRuntimeRestore/>);
  await waitFor(()=>expect(state.restoreNetworkBlock).toHaveBeenCalledWith(network));
  expect(state.restoreGitBlock).toHaveBeenCalledWith(git);
  expect(state.restoreTerminalBlock).not.toHaveBeenCalled();
});
it("waits for workspace hydration and skips stale profile or block mappings", async () => {
  state.hydrated=false;
  list.mockResolvedValue([
    {sessionId:"old",runtimeKey:"git-block",kind:"git",profileId:"other"},
    {sessionId:"gone",runtimeKey:"removed-block",kind:"network",profileId:"profile"},
  ]);
  const view=render(<ServerRuntimeRestore/>);
  expect(list).not.toHaveBeenCalled();
  state.hydrated=true;view.rerender(<ServerRuntimeRestore/>);
  await waitFor(()=>expect(list).toHaveBeenCalledOnce());
  expect(state.restoreGitBlock).not.toHaveBeenCalled();
  expect(state.restoreNetworkBlock).not.toHaveBeenCalled();
});

const git = { sessionId: "old-git", runtimeKey: "git-block", kind: "git", profileId: "profile" };
const network = { sessionId: "old-network", runtimeKey: "network-block", kind: "network", profileId: "profile" };
function pendingGit() {
  let complete!: () => void;
  state.restoreGitBlock.mockReturnValue(new Promise<void>(resolve => { complete = resolve; }));
  list.mockResolvedValue([git, network]);
  return () => complete();
}
it("continues remaining restores after a workspace document update", async () => {
  const complete = pendingGit();
  const view = render(<ServerRuntimeRestore/>);
  await waitFor(() => expect(state.restoreGitBlock).toHaveBeenCalled());
  state.document = { ...state.document };
  view.rerender(<ServerRuntimeRestore/>);
  await act(async () => { complete(); });
  expect(state.restoreNetworkBlock).toHaveBeenCalledExactlyOnceWith(network);
  expect(state.restoreGitBlock).toHaveBeenCalledOnce();
  expect(list).toHaveBeenCalledOnce();
});
it("checks the latest target before restoring the next block", async () => {
  const complete = pendingGit();
  const view = render(<ServerRuntimeRestore/>);
  await waitFor(() => expect(state.restoreGitBlock).toHaveBeenCalled());
  const workspace = state.document.workspaces[0];
  state.document = { workspaces: [{ ...workspace, layout: { ...workspace.layout, second: { ...workspace.layout.second, profileId: "other" } } }] };
  view.rerender(<ServerRuntimeRestore/>);
  await act(async () => { complete(); });
  expect(state.restoreNetworkBlock).not.toHaveBeenCalled();
});
it("continues other blocks after an individual attachment rejects", async () => {
  list.mockResolvedValue([git, network]);
  state.restoreGitBlock.mockRejectedValue(new Error("attach failed"));
  render(<ServerRuntimeRestore/>);
  await waitFor(() => expect(state.restoreNetworkBlock).toHaveBeenCalledWith(network));
});
it("cancels the old pass when locked and runs a new pass after unlock", async () => {
  const complete = pendingGit();
  const view = render(<ServerRuntimeRestore/>);
  await waitFor(() => expect(state.restoreGitBlock).toHaveBeenCalled());
  activity.enabled = false;
  view.rerender(<ServerRuntimeRestore/>);
  await act(async () => { complete(); });
  expect(state.restoreNetworkBlock).not.toHaveBeenCalled();
  activity.enabled = true;
  view.rerender(<ServerRuntimeRestore/>);
  await waitFor(() => expect(state.restoreNetworkBlock).toHaveBeenCalledWith(network));
  expect(list).toHaveBeenCalledTimes(2);
});
it("retries failed registry queries and cancels retry timers on unmount", async () => {
  vi.useFakeTimers();
  list.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([network]);
  const view = render(<ServerRuntimeRestore/>);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(state.restoreNetworkBlock).toHaveBeenCalledWith(network);
  view.unmount();
  list.mockRejectedValue(new Error("offline"));
  const next = render(<ServerRuntimeRestore/>);
  await act(async () => { await Promise.resolve(); });
  const calls = list.mock.calls.length;
  next.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(list).toHaveBeenCalledTimes(calls);
});
