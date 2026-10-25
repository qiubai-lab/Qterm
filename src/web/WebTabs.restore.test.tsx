import { useEffect } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebTabs } from "./WebTabs";
import { createWebTabSessionStore } from "./webTabSessionStore";
import { createWorkspaceDocument } from "../workspace/model";

vi.mock("./WebBrowserPane", () => ({ WebBrowserPane: ({ initialAddress, onMetadata }: { initialAddress?: string; onMetadata: (value: { address: string; title: string; loading: boolean }) => void }) => {
  useEffect(() => { onMetadata({ address: "", title: "", loading: false }); }, [onMetadata]);
  return <input aria-label="已创建的页面" defaultValue={initialAddress}/>;
} }));
afterEach(cleanup);

it("restores all 99 saved tabs while starting only the selected page", () => {
  const store = createWebTabSessionStore(), doc = createWorkspaceDocument();
  doc.workspaces[0].layout = { type: "web", blockId: "a", profileId: null };
  const saved = { blockId: "a", profileId: null, selectedTabId: "tab-98", tabs: Array.from({ length: 99 }, (_, i) => ({
    id: `tab-${i}`, title: `Page ${i}`, address: `https://example.test/${i}`,
  })) };
  store.restore({ blocks: [saved] }, doc);
  const header = document.createElement("div"); document.body.append(header);
  const view = render(<WebTabs header={header} sessionStore={store} blockId="a" profileId={null} sessionId={null} connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/>);
  expect(screen.getAllByRole("tab")).toHaveLength(99);
  expect(screen.getByRole("tab", { name: "Page 98" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getAllByLabelText("已创建的页面")).toHaveLength(1);
  expect(screen.getByLabelText("已创建的页面")).toHaveValue(saved.tabs[98].address);
  expect(screen.getByRole("button", { name: "新建标签页" })).toBeDisabled();
  expect(store.snapshot()?.blocks[0]).toEqual(saved);
  view.unmount(); header.remove();
});

it("restores order/selection, leaves background guests uncreated and preserves URLs through initial metadata", () => {
  const store = createWebTabSessionStore(), doc = createWorkspaceDocument();
  doc.workspaces[0].layout = { type: "web", blockId: "a", profileId: null };
  const saved = { blockId: "a", profileId: null, selectedTabId: "two", tabs: [
    { id: "one", title: "First", address: "https://example.test/one" }, { id: "two", title: "Second", address: "https://example.test/two" },
  ] };
  store.restore({ blocks: [saved] }, doc);
  const header = document.createElement("div"); document.body.append(header);
  const props = { header, sessionStore: store, blockId: "a", profileId: null, sessionId: null, connecting: false, visible: true, supported: true, notice: "", onConnect: vi.fn(), onActivate: vi.fn() };
  let view = render(<WebTabs {...props}/>);
  expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["First", "Second"]);
  expect(screen.getByRole("tab", { name: "Second" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getAllByLabelText("已创建的页面")).toHaveLength(1);
  expect(screen.getByLabelText("已创建的页面")).toHaveValue(saved.tabs[1].address);
  expect(store.snapshot()?.blocks[0]).toEqual(saved);
  fireEvent.click(screen.getByRole("tab", { name: "First" }));
  expect(screen.getAllByLabelText("已创建的页面")).toHaveLength(2);
  view.unmount();
  view = render(<WebTabs {...props}/>);
  expect(screen.getByRole("tab", { name: "First" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getAllByLabelText("已创建的页面")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "关闭标签页 Second" }));
  expect(store.snapshot()?.blocks[0].tabs).toEqual([saved.tabs[0]]);
  view.unmount(); header.remove();
});
