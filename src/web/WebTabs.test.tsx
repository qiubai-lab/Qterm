import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebTabs } from "./WebTabs";

vi.mock("./WebBrowserPane", () => ({ WebBrowserPane: ({ visible, onMetadata }: { visible: boolean; onMetadata: (state: { title: string; address: string; loading: boolean }) => void }) => <>
  <input aria-label={visible ? "当前页面内容" : "后台页面内容"}/>
  <button onClick={() => onMetadata({ title: "测试页面", address: "https://example.test", loading: true })}>开始页面加载</button>
  <button onClick={() => onMetadata({ title: "已载入页面", address: "https://example.test", loading: false })}>完成页面加载</button>
</> }));
afterEach(cleanup);
it("keeps page instances and their input state across tab switching and isolates header dragging", () => {
  const header = document.createElement("div"); document.body.append(header);
  const drag = vi.fn();
  const view = render(<div onPointerDown={drag}><WebTabs header={header} profileId="a" sessionId="ssh" connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/></div>);
  const first = screen.getByLabelText("当前页面内容"); fireEvent.change(first, { target: { value: "draft" } });
  fireEvent.pointerDown(screen.getByRole("button", { name: "新建标签页" }));
  expect(drag).not.toHaveBeenCalled();
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
