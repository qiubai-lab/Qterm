import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createWorkspace } from "./model";
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
