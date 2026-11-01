import { render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ServerRuntimeRestore } from "./ServerRuntimeRestore";
const state = vi.hoisted(() => ({
  hydrated: true,
  document: {workspaces: [{layout: {type:"split",id:"split",direction:"horizontal",ratio:0.5,first:{type:"git",blockId:"git-block",target:{type:"remote",profileId:"profile"}},second:{type:"network",blockId:"network-block",profileId:"profile"}}}]},
  restoreTerminalBlock:vi.fn(),restoreFileBlock:vi.fn(),restoreGitBlock:vi.fn(),restoreNetworkBlock:vi.fn(),
}));
const list = vi.hoisted(() => vi.fn());
vi.mock("../workspace/WorkspaceProvider", () => ({useWorkspace:()=>state}));
vi.mock("./services/runtimeSessions", () => ({listRetainedSessions:list}));
beforeEach(() => {vi.clearAllMocks();state.hydrated=true;});
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
