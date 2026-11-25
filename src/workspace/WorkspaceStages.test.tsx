import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createWorkspace } from "./model";
import { DesktopContext } from "../remoteRuntime/desktop/context";
import { DesktopEnvironments } from "../remoteRuntime/desktop/environments";
import { WorkspaceStages } from "./WorkspaceStages";

const draw = vi.hoisted(() => vi.fn());
vi.mock("./LayoutView", () => ({
  WorkspaceCanvas: ({ workspace, visible }: { workspace: { id: string }; visible: boolean }) => {
    draw(workspace.id, visible);
    return <textarea data-testid={workspace.id}/>;
  },
}));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("mounts the selected view first, warms one at a time, and updates only the two switching canvases", () => {
  vi.useFakeTimers();
  const workspaces = ["one", "two", "three"].map(name => createWorkspace(name));
  const [a, b, c] = workspaces.map(w => w.id);
  const view = (activeId: string) => <WorkspaceStages workspaces={workspaces} activeId={activeId}
    hydrated covered={false} attentionId={null} transition={{ workspaceId: activeId, direction: "forward" }}
    onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>;
  const tree = render(view(c));
  const draft = screen.getByTestId(c) as HTMLTextAreaElement;
  draft.value = "unfinished";
  expect(screen.queryByTestId(a)).toBeNull();
  expect(screen.queryByTestId(b)).toBeNull();
  tree.rerender(view(b));
  expect(screen.getByTestId(b)).toBeVisible();
  act(() => vi.advanceTimersByTime(150));
  expect(screen.getByTestId(a)).toBeInTheDocument();
  draw.mockClear();
  tree.rerender(view(c));
  expect(draw.mock.calls).toEqual([[b, false], [c, true]]);
  expect(screen.getByTestId(c)).toBe(draft);
  expect(draft.value).toBe("unfinished");
});

it("hides foreground-only work when switching servers and keeps the local terminal mounted", async () => {
  const host = new DesktopEnvironments({ connect: async () => "/api", disconnect: async () => {} });
  const workspace = createWorkspace();
  render(<DesktopContext value={host}><WorkspaceStages workspaces={[workspace]} activeId={workspace.id}
    hydrated covered={false} attentionId={null} transition={{ workspaceId: workspace.id, direction: null }}
    onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/></DesktopContext>);
  const local = screen.getByTestId(workspace.id);
  await act(() => host.connect({ id: "remote", name: "远程", endpoint: "https://test.invalid" }));
  expect(draw).toHaveBeenLastCalledWith(workspace.id, false);
  act(() => host.focus("local"));
  expect(draw).toHaveBeenLastCalledWith(workspace.id, true);
  expect(screen.getByTestId(workspace.id)).toBe(local);
});
