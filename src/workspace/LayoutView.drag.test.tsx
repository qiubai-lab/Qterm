import { useReducer, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceCanvas } from "./LayoutView";
import { workspaceReducer } from "./reducer";
import type { WorkspaceDocument } from "./model";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), mutations: vi.fn(), mounts: 0 }));
vi.mock("./WorkspaceProvider", () => ({ useWorkspace: mocks.workspace }));
vi.mock("../terminal/TerminalPanel", () => ({ TerminalPanel: () => <div>终端内容</div> }));
vi.mock("../web/webModel", async original => ({ ...await original<object>(), supportsWebBlocks: () => true }));
vi.mock("../web/WebBrowserPane", () => ({ WebBrowserPane: ({ visible }: { visible: boolean }) => {
  const [id] = useState(() => ++mocks.mounts);
  return <input aria-label="网页内容" data-visible={visible} data-instance={id} defaultValue="未提交的网页表单"/>;
} }));
const document: WorkspaceDocument = { schemaVersion: 10, activeWorkspaceId: "workspace", recentProfileIds: [], recentGitRepositories: [], workspaces: [{
  id: "workspace", name: "工作区", activeBlockId: "terminal", layout: {
    type: "split", id: "split", direction: "horizontal", ratio: .5,
    first: { type: "terminal", blockId: "terminal", profileId: null, restoreDirectory: null },
    second: { type: "web", blockId: "web", profileId: null },
  },
}] };
function Harness({ visible = true }: { visible?: boolean }) {
  const [state, dispatch] = useReducer(workspaceReducer, document);
  mocks.workspace.mockReturnValue({ document: state, profiles: [], runtimes: {}, networkRuntimes: {},
    dispatch: (action: Parameters<typeof dispatch>[0]) => { mocks.mutations(action); dispatch(action); },
    splitTerminalBlock: vi.fn(), selectBlockTarget: vi.fn(), clearBlockBuffer: vi.fn(), disconnectBlock: vi.fn(), restartLocalBlock: vi.fn(),
    selectNetworkTarget: vi.fn(), disconnectNetworkBlock: vi.fn(),
  });
  return <WorkspaceCanvas workspace={state.workspaces[0]} visible={visible} onRequestClose={vi.fn()} onRequestAuthConnection={vi.fn()}/>;
}
beforeEach(() => {
  mocks.mounts = 0; mocks.mutations.mockClear();
  class Pointer extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId ?? 1; } }
  vi.stubGlobal("PointerEvent", Pointer);
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() }, hasPointerCapture: { configurable: true, value: () => true }, releasePointerCapture: { configurable: true, value: vi.fn() },
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.matches(".workspace-layout-surface") ? new DOMRect(0, 0, 1003, 600) : new DOMRect(0, 0, 100, 30);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function begin(view: ReturnType<typeof render>, x = 530, y = 300, source = "terminal") {
  const header = view.container.querySelector<HTMLElement>(`[data-layout-block="${source}"] header`)!;
  fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: source === "terminal" ? 100 : 700, clientY: 15 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: x, clientY: y });
  return header;
}

it.each([["left", 530, 300], ["right", 980, 300], ["top", 750, 30], ["bottom", 750, 570], ["center", 750, 300]] as const)("drops into a browser's %s region without hiding or remounting its page", (position, x, y) => {
  const view = render(<Harness/>);
  const page = screen.getByRole("textbox", { name: "网页内容" });
  begin(view, x, y);
  expect(page).toHaveAttribute("data-visible", "true");
  expect(view.container.querySelector('[data-app-overlay="transition"]')).toBeInTheDocument();
  expect(view.container.querySelector(`[data-drop-target="web"] .drop-${position}`)).toBeInTheDocument();
  fireEvent.pointerUp(window, { pointerId: 1, clientX: x, clientY: y });
  expect(mocks.mutations).toHaveBeenCalledWith(expect.objectContaining({ type: "moveBlock", sourceId: "terminal", targetId: "web", position }));
  expect(view.container.querySelector('[data-app-overlay="transition"]')).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "网页内容" })).toBe(page);
  expect(page).toHaveValue("未提交的网页表单");
  expect(mocks.mounts).toBe(1);
});

it.each(["cancel", "capture", "escape", "blur", "hide", "unmount"])("cancels on %s without committing a split", reason => {
  const view = render(<Harness/>);
  const header = begin(view);
  if (reason === "cancel") fireEvent.pointerCancel(window, { pointerId: 1 });
  if (reason === "capture") fireEvent(header, new PointerEvent("lostpointercapture", { pointerId: 1 }));
  if (reason === "escape") fireEvent.keyDown(window, { key: "Escape" });
  if (reason === "blur") fireEvent.blur(window);
  if (reason === "hide") view.rerender(<Harness visible={false}/>);
  if (reason === "unmount") view.unmount();
  expect(view.container.querySelector('[data-app-overlay="transition"]')).not.toBeInTheDocument();
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 530, clientY: 300 });
  expect(mocks.mutations.mock.calls.some(([action]) => action.type === "moveBlock")).toBe(false);
});

it("uses release coordinates, ignores another pointer and does not drop outside the workspace", () => {
  const view = render(<Harness/>);
  begin(view);
  fireEvent.pointerUp(window, { pointerId: 2, clientX: 530, clientY: 300 });
  expect(view.container.querySelector(".layout-drag-surface")).toBeInTheDocument();
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 1100, clientY: 300 });
  expect(mocks.mutations.mock.calls.some(([action]) => action.type === "moveBlock")).toBe(false);
  expect(view.container.querySelector(".layout-drag-surface")).not.toBeInTheDocument();
});

it("moves the browser itself and identifies it as a webpage", () => {
  const view = render(<Harness/>);
  // The tab strip is portaled into the header: its React parent is not the header.
  fireEvent.pointerDown(view.container.querySelector(".web-tabs")!, { button: 0, pointerId: 1, clientX: 700, clientY: 15 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 30, clientY: 300 });
  expect(view.container.querySelector(".drag-ghost")).toHaveTextContent("网页");
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 300 });
  expect(mocks.mutations).toHaveBeenCalledWith(expect.objectContaining({ type: "moveBlock", sourceId: "web", targetId: "terminal", position: "left" }));
  expect(mocks.mounts).toBe(1);
});

it.each([["左右分割网页", "horizontal"], ["上下分割网页", "vertical"]] as const)("creates a same-connection browser with %s while preserving the current page", (label, direction) => {
  render(<Harness/>);
  const first = screen.getByRole("textbox", { name: "网页内容" });
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(mocks.mutations).toHaveBeenCalledWith({ type: "openWeb", workspaceId: "workspace", anchorBlockId: "web", profileId: null, direction });
  expect(screen.getAllByRole("textbox", { name: "网页内容" })).toHaveLength(2);
  expect(first).toBeInTheDocument(); expect(first).toHaveValue("未提交的网页表单");
  expect(mocks.mounts).toBe(2);
});

it("cancels a divider resize without persisting the preview ratio", () => {
  const view = render(<Harness/>);
  const divider = screen.getByRole("separator");
  const host = view.container.querySelector('[data-workspace-block-host="web"]')!;
  const initial = host.getAttribute("style");
  fireEvent.pointerDown(divider, { button: 0, pointerId: 1, clientX: 500, clientY: 300 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 700, clientY: 300 });
  expect(host.getAttribute("style")).not.toBe(initial);
  expect(screen.getByRole("textbox", { name: "网页内容" })).toHaveAttribute("data-visible", "true");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(host.getAttribute("style")).toBe(initial);
  expect(mocks.mutations.mock.calls.some(([action]) => action.type === "resizeSplit")).toBe(false);
});
