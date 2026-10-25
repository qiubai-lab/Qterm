import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { WebTabs } from "./WebTabs";
import type { WebBrowserPane } from "./WebBrowserPane";
const panes = vi.hoisted(() => new Map<string, ComponentProps<typeof WebBrowserPane>>());
vi.mock("./WebBrowserPane", () => ({ WebBrowserPane: (props: ComponentProps<typeof WebBrowserPane>) => {
  panes.set(props.initialPopup?.requestId ?? "source", props);
  return <input aria-label={props.initialPopup?.requestId ?? "source"} defaultValue="page state"/>;
} }));
afterEach(() => { cleanup(); panes.clear(); });
it("keeps the source page, inherits the target, deduplicates and closes the popup tab", () => {
  const header = document.createElement("div"); document.body.append(header);
  const view = render(<WebTabs header={header} profileId="remote" sessionId="ssh-source" connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/>);
  const source = screen.getByLabelText("source");
  const request = { label: "web-guest", requestId: "popup", url: "about:blank" };
  act(() => { panes.get("source")!.onNewWindow!(request); panes.get("source")!.onNewWindow!(request); });
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(source).toBeInTheDocument(); expect(source).not.toBeVisible();
  expect(panes.get("popup")).toMatchObject({ profileId: "remote", sessionId: "ssh-source", initialPopup: request });
  expect(panes.get("popup")!.initialAddress).toBeUndefined();
  act(() => panes.get("popup")!.onWindowClose!());
  expect(screen.getAllByRole("tab")).toHaveLength(1); expect(source).toBeVisible(); expect(source).toHaveValue("page state");
  view.unmount(); header.remove();
});
it("reserves tab capacity synchronously for bursts and leaves existing tabs untouched on overflow", () => {
  const header = document.createElement("div"); document.body.append(header);
  const view = render(<WebTabs header={header} profileId={null} sessionId={null} connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/>);
  act(() => { for (let i = 0; i < 98; i++) panes.get("source")!.onNewWindow!({ label: "web-source", requestId: String(i), url: "http://localhost/" }); });
  expect(screen.getAllByRole("tab")).toHaveLength(99);
  expect(() => panes.get("source")!.onNewWindow!({ label: "web-source", requestId: "overflow", url: "http://localhost/" })).toThrow("99 个标签页");
  expect(screen.getAllByRole("tab")).toHaveLength(99);
  act(() => { panes.get("0")!.onWindowClose!(); panes.get("1")!.onWindowClose!(); });
  expect(screen.getAllByRole("tab")).toHaveLength(97);
  view.unmount(); header.remove();
});
