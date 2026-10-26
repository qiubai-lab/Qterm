import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebTabs } from "./WebTabs";

vi.mock("./WebBrowserPane", () => ({ WebBrowserPane: ({ visible, onMetadata }: { visible: boolean; onMetadata: (state: { title: string; address: string; loading: boolean }) => void }) => <>
  <input aria-label={visible ? "当前页面内容" : "后台页面内容"}/>
  <button onClick={() => onMetadata({ title: "测试页面", address: "https://example.test", loading: true })}>开始页面加载</button>
  <button onClick={() => onMetadata({ title: "已载入页面", address: "https://example.test", loading: false })}>完成页面加载</button>
</> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("allows 99 tabs, rejects the 100th and re-enables adding after closing one", () => {
  const header = document.createElement("div"); document.body.append(header);
  const view = render(<WebTabs header={header} profileId="a" sessionId="ssh" connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/>);
  const add = screen.getByRole("button", { name: "新建标签页" });
  act(() => { for (let i = 1; i < 98; i++) fireEvent.click(add); });
  expect(screen.getAllByRole("tab")).toHaveLength(98);
  expect(add).toBeEnabled();
  fireEvent.click(add);
  expect(screen.getAllByRole("tab")).toHaveLength(99);
  expect(add).toBeDisabled();
  fireEvent.click(add);
  expect(screen.getAllByRole("tab")).toHaveLength(99);
  fireEvent.click(screen.getAllByRole("button", { name: /关闭标签页/ })[0]);
  expect(add).toBeEnabled();
  fireEvent.click(add);
  expect(screen.getAllByRole("tab")).toHaveLength(99);
  view.unmount(); header.remove();
});
it("keeps page instances and their input state across tab switching and isolates header dragging", () => {
  const header = document.createElement("div"); document.body.append(header);
  const drag = vi.fn();
  const view = render(<div onPointerDown={drag}><WebTabs header={header} profileId="a" sessionId="ssh" connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/></div>);
  const first = screen.getByLabelText("当前页面内容"); fireEvent.change(first, { target: { value: "draft" } });
  fireEvent.pointerDown(screen.getByRole("button", { name: "新建标签页" }));
  expect(drag).not.toHaveBeenCalled();
  fireEvent.pointerDown(header.querySelector(".web-tabs")!);
  expect(drag).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "新建标签页" }));
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(first).toBeInTheDocument(); expect(first).not.toBeVisible();
  fireEvent.click(screen.getAllByRole("tab")[0]);
  expect(screen.getByLabelText("当前页面内容")).toBe(first); expect(first).toHaveValue("draft");
  fireEvent.click(screen.getAllByRole("button", { name: /关闭标签页/ })[0]);
  expect(first).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /关闭标签页/ }));
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  view.unmount(); header.remove();
});

it("updates each tab's title and loading indicator and supports keyboard selection", () => {
  const header = document.createElement("div"); document.body.append(header);
  const view = render(<WebTabs header={header} profileId="a" sessionId="ssh" connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button", { name: "开始页面加载" }));
  const first = screen.getByRole("tab", { name: "测试页面" });
  expect(first.querySelector(".web-address-spinner")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "新建标签页" }));
  const second = screen.getByRole("tab", { name: "新标签页" });
  fireEvent.keyDown(second, { key: "ArrowLeft" });
  expect(first).toHaveFocus(); expect(first).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("button", { name: "完成页面加载" }));
  expect(screen.getByRole("tab", { name: "已载入页面" })).toBe(first);
  expect(first.querySelector(".web-address-spinner")).toBeNull();
  expect(second).toHaveTextContent("新标签页");
  view.unmount(); header.remove();
});

it("delivers terminal links into empty/new tabs without overwriting pages and rejects excess tabs", () => {
  const header = document.createElement("div"); document.body.append(header);
  let open!: (url: string) => void;
  const register = vi.fn((handler: (url: string) => void) => { open = handler; return vi.fn(); });
  const view = render(<WebTabs header={header} registerOpener={register} profileId={null} sessionId={null} connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/>);
  act(() => open("http://localhost/first"));
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  act(() => open("http://localhost/second"));
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  act(() => { for (let i = 2; i < 99; i++) open(`http://localhost/${i}`); });
  expect(() => open("http://localhost/overflow")).toThrow("99 个标签页");
  expect(screen.getAllByRole("tab")).toHaveLength(99);
  expect(register).toHaveBeenCalledOnce();
  view.unmount(); header.remove();
});

it.each(["MacIntel", "Win32"])("Ctrl+W closes the selected tab and keeps a fresh blank tab on %s", platform => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  const header = document.createElement("div"); document.body.append(header);
  const view = render(<WebTabs active blockId="browser" header={header} profileId={null} sessionId={null} connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/>);
  const first = screen.getByLabelText("当前页面内容"); fireEvent.change(first, { target: { value: "kept" } });
  fireEvent.click(screen.getByRole("button", { name: "新建标签页" }));
  const second = screen.getByLabelText("当前页面内容");
  expect(fireEvent.keyDown(second, { key: "w", code: "KeyW", ctrlKey: true })).toBe(false);
  expect(second).not.toBeInTheDocument(); expect(first).toHaveValue("kept");
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  fireEvent.keyDown(first, { key: "w", code: "KeyW", ctrlKey: true });
  expect(first).not.toBeInTheDocument();
  expect(screen.getByLabelText("当前页面内容")).toHaveValue("");
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  view.unmount(); header.remove();
});
