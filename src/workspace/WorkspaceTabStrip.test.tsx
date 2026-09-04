import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWorkspace, createWorkspaceDocument } from "./model";
import { blockIds } from "./layout";
import { WorkspaceTabStrip } from "./WorkspaceTabStrip";
const mocks = vi.hoisted(() => ({ close: vi.fn(), dispatch: vi.fn(), count: vi.fn() }));
let state = createWorkspaceDocument();
vi.mock("./WorkspaceProvider", () => ({ useWorkspace: () => ({ document: state, dispatch: mocks.dispatch, closeSessions: mocks.close, blocksForWorkspace: (workspace: typeof state.workspaces[number]) => blockIds(workspace.layout), connectedCount: mocks.count }) }));
function Harness({ disabled = false }: { disabled?: boolean }) {
  return <WorkspaceTabStrip disabled={disabled} className="workspace-tab-strip">{state.workspaces.map(item => <div className="workspace-tab" data-workspace-id={item.id} key={item.id}><button className="workspace-tab-select">{item.name}</button></div>)}</WorkspaceTabStrip>;
}
const open = (name = "B") => fireEvent.contextMenu(screen.getByRole("button", { name }), { clientX: 40, clientY: 30 });
beforeEach(() => {
  vi.clearAllMocks(); mocks.close.mockResolvedValue(undefined); mocks.count.mockReturnValue(0);
  state = { ...createWorkspaceDocument(), workspaces: ["A", "B", "C", "D"].map(name => ({ ...createWorkspace(name), id: name })), activeWorkspaceId: "A" };
});
afterEach(cleanup);
it("does not select on right click; asks once even without sessions and cancels safely", async () => {
  render(<Harness/>); open();
  expect(mocks.dispatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: "关闭其他工作区" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByText("将关闭 3 个工作区，断开 0 个活动会话")).toBeInTheDocument();
  expect(mocks.close).not.toHaveBeenCalled();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.getByRole("dialog")).toHaveAttribute("data-state", "closing");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.close).not.toHaveBeenCalled();
});
it("cleans the whole confirmed batch once before dispatch, and prevents double submit", async () => {
  let resolve!: () => void;
  mocks.close.mockReturnValue(new Promise<void>(done => { resolve = done; }));
  render(<Harness/>); open();
  fireEvent.click(screen.getByRole("menuitem", { name: "关闭右侧工作区" }));
  const confirm = screen.getByRole("button", { name: "关闭 2 个工作区" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledWith(state.workspaces.slice(2).flatMap(item => blockIds(item.layout)));
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  await act(async () => resolve());
  expect(screen.getByRole("dialog")).toHaveAttribute("data-state", "closing");
  expect(mocks.dispatch).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.dispatch).toHaveBeenCalledWith({ type: "closeWorkspaces", workspaceIds: ["C", "D"], anchorId: "B" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("preserves layout on failure and allows retry without another confirmation", async () => {
  mocks.close.mockRejectedValueOnce(new Error("关闭失败"));
  render(<Harness/>); open();
  fireEvent.click(screen.getByRole("menuitem", { name: "关闭左侧工作区" }));
  fireEvent.click(screen.getByRole("button", { name: "关闭 1 个工作区" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("关闭失败");
  expect(mocks.dispatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "关闭 1 个工作区" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.dispatch).toHaveBeenCalledOnce();
});
it("disables empty ranges, supports keyboard dismissal and suppresses menus while locked", () => {
  state = { ...state, workspaces: [state.workspaces[0]] };
  const view = render(<Harness/>); open("A");
  for (const item of screen.getAllByRole("menuitem")) expect(item).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.getByRole("button", { name: "A" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("button", { name: "A" }), { key: "F10", shiftKey: true });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  view.rerender(<Harness disabled/>);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  open("A"); expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
it("does not add newly created workspaces to an already confirmed scope", async () => {
  const view = render(<Harness/>); open();
  fireEvent.click(screen.getByRole("menuitem", { name: "关闭右侧工作区" }));
  state = { ...state, workspaces: [...state.workspaces, { ...createWorkspace("E"), id: "E" }] };
  view.rerender(<Harness/>);
  fireEvent.click(screen.getByRole("button", { name: "关闭 2 个工作区" }));
  await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledWith({ type: "closeWorkspaces", workspaceIds: ["C", "D"], anchorId: "B" }));
});
it("moves keyboard focus through available actions and dismisses on outside interaction", () => {
  render(<Harness/>); open("A");
  const others = screen.getByRole("menuitem", { name: "关闭其他工作区" });
  expect(others).toHaveFocus();
  fireEvent.keyDown(others, { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "关闭右侧工作区" })).toHaveFocus();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  open(); fireEvent.scroll(window);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
it("abandons the dialog if its retained workspace disappears", () => {
  const view = render(<Harness/>); open();
  fireEvent.click(screen.getByRole("menuitem", { name: "关闭其他工作区" }));
  state = { ...state, workspaces: state.workspaces.filter(item => item.id !== "B") };
  view.rerender(<Harness/>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.close).not.toHaveBeenCalled();
});
it("closes a menu when a modal appears asynchronously", async () => {
  render(<Harness/>); open();
  const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog");
  await act(async () => document.body.append(dialog));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  dialog.remove();
});
it("skips exit delays under reduced motion and can reopen after cancellation", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  try {
    render(<Harness/>); open();
    fireEvent.click(screen.getByRole("menuitem", { name: "关闭其他工作区" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "关闭右侧工作区" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭 2 个工作区" }));
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  } finally { vi.unstubAllGlobals(); }
});
