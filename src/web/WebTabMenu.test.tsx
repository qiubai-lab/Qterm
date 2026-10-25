import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebTabs } from "./WebTabs";

const native = vi.hoisted(() => ({ focus: undefined as undefined | ((label: string) => void), stop: vi.fn() }));
vi.mock("../lib/tauri/web", () => ({ listenWebFocus: vi.fn(async (receive: (label: string) => void) => { native.focus = receive; return native.stop; }) }));
vi.mock("./WebBrowserPane", () => ({ WebBrowserPane: ({ visible, onMetadata }: { visible: boolean; onMetadata: (state: { title: string; address: string; loading: boolean }) => void }) => <input aria-label={visible ? "当前页面" : "后台页面"} onChange={event => onMetadata({ title: event.target.value, address: "", loading: false })}/> }));
afterEach(() => { cleanup(); document.querySelectorAll(".test-tab-header").forEach(node => node.remove()); vi.clearAllMocks(); });
function mount() {
  const header = document.createElement("div"); header.className = "test-tab-header"; document.body.append(header);
  const props = { header, profileId: "a", sessionId: "ssh", connecting: false, visible: true, supported: true, notice: "", onConnect: vi.fn(), onActivate: vi.fn() };
  const view = render(<WebTabs {...props}/>);
  return { header, view, props };
}
function pages() {
  const result = mount();
  for (const name of ["A", "B", "C", "D"]) {
    if (name !== "A") fireEvent.click(screen.getByRole("button", { name: "新建标签页" }));
    fireEvent.change(screen.getByLabelText("当前页面"), { target: { value: name } });
  }
  return result;
}
const open = (name: string) => fireEvent.contextMenu(screen.getByRole("tab", { name }), { clientX: 40, clientY: 30 });

it("removes title bubbles immediately and suppresses hover/focus bubbles while the menu is open", () => {
  const overflow = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(500);
  try {
    pages();
    const tab = screen.getByRole("tab", { name: "A" });
    fireEvent.mouseEnter(tab);
    expect(screen.getByRole("tooltip")).toHaveTextContent("A");
    open("A");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    expect(tab).not.toHaveAttribute("aria-describedby");
    fireEvent.mouseEnter(screen.getByRole("tab", { name: "B" }));
    fireEvent.focus(tab);
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.mouseLeave(tab); fireEvent.mouseEnter(tab);
    expect(screen.getByRole("tooltip")).toHaveTextContent("A");
    fireEvent.keyDown(tab, { key: "F10", shiftKey: true });
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
  } finally { overflow.mockRestore(); }
});

it("right-clicks without selecting and closes the requested batch while preserving other blocks", () => {
  pages(); const other = mount();
  open("B");
  expect(screen.getByRole("tab", { name: "D" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("menuitem", { name: "关闭右侧标签" })).toHaveTextContent("2");
  fireEvent.click(screen.getByRole("menuitem", { name: "关闭右侧标签" }));
  expect(screen.queryByRole("tab", { name: "C" })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "D" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("aria-selected", "true");
  expect(within(other.header).getAllByRole("tab")).toHaveLength(1);
  open("B"); fireEvent.click(screen.getByRole("menuitem", { name: "关闭其他标签" }));
  expect(screen.queryByRole("tab", { name: "A" })).not.toBeInTheDocument();
  open("B"); fireEvent.click(screen.getByRole("menuitem", { name: "关闭当前标签" }));
  expect(screen.queryByRole("tab", { name: "B" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("tab", { name: "新标签页" })).toHaveLength(2);
});
it("supports disabled ranges, keyboard navigation, Escape, outside clicks and clearing all tabs", () => {
  pages();
  fireEvent.keyDown(screen.getByRole("tab", { name: "A" }), { key: "F10", shiftKey: true });
  expect(screen.getByRole("menuitem", { name: "关闭左侧标签" })).toBeDisabled();
  expect(screen.getByRole("menuitem", { name: "关闭当前标签" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "关闭其他标签" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "关闭右侧标签" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.getByRole("tab", { name: "A" })).toHaveFocus();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  open("D"); expect(screen.getByRole("menuitem", { name: "关闭右侧标签" })).toBeDisabled();
  fireEvent.pointerDown(document.body); expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  open("B"); fireEvent.click(screen.getByRole("menuitem", { name: "关闭全部标签" }));
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  expect(screen.getByRole("tab", { name: "新标签页" })).toHaveAttribute("aria-selected", "true");
});
it("dismisses on native page focus and workspace hiding, but survives local strip scrolling", async () => {
  const { view, props } = pages(); open("B");
  fireEvent.scroll(screen.getByRole("tablist")); expect(screen.getByRole("menu")).toBeInTheDocument();
  await act(async () => native.focus?.("web-fixture"));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(native.stop).toHaveBeenCalled();
  open("B"); view.rerender(<WebTabs {...props} visible={false}/>);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
