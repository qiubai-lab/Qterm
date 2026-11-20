import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceProvider";

afterEach(cleanup);
it("propagates navigation to the shell without waking consumers of block state", () => {
  const observe = vi.fn();
  let navigation!: ReturnType<typeof useWorkspace>;
  function Shell() { navigation = useWorkspace(); return null; }
  function Panel() { observe(useWorkspace("blocks")); return null; }
  render(<WorkspaceProvider><Shell/><Panel/></WorkspaceProvider>);
  const first = navigation.activeWorkspace.id;
  act(() => navigation.dispatch({ type: "addWorkspace" }));
  expect(navigation.activeWorkspace.id).not.toBe(first);
  observe.mockClear();
  act(() => navigation.dispatch({ type: "selectWorkspace", workspaceId: first }));
  expect(navigation.activeWorkspace.id).toBe(first);
  expect(observe).not.toHaveBeenCalled();
  act(() => navigation.dispatch({ type: "recordRecentProfile", profileId: "build" }));
  expect(observe.mock.lastCall?.[0].document.recentProfileIds).toEqual(["build"]);
});
