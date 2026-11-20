import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RemoteWorkbenchFrame } from "./RemoteWorkbenchFrame";
import { DesktopEnvironments, serverKey } from "./environments";

afterEach(cleanup);

it("keeps the remote document mounted and confines verification to the terminal beside the disabled rail", async () => {
  const entry = { id: "frame", name: "开发服", endpoint: "https://dev.test" };
  const host = new DesktopEnvironments({ connect: async url => url, disconnect: async () => {} });
  await host.connect(entry);
  const env = host.find(serverKey(entry.id))!;
  const shortcut = vi.fn();
  const frame = (status: string) => <RemoteWorkbenchFrame host={host} env={{...env, status}} visible shortcut={shortcut}/>;
  const view = render(frame("需要登录"));
  const documentFrame = screen.getByLabelText("开发服 工作台");
  const assertGated = () => {
    expect(documentFrame.closest(".terminal-block")).toBeVisible();
    const controls = within(screen.getByRole("complementary", {name: "工具"})).getAllByRole("button");
    expect(controls).toHaveLength(10);
    controls.forEach(button => expect(button).toBeDisabled());
  };
  assertGated();
  view.rerender(frame("已连接"));
  expect(screen.getByLabelText("开发服 工作台")).toBe(documentFrame);
  expect(screen.queryByRole("complementary", {name: "工具"})).toBeNull();
  expect(documentFrame.closest(".terminal-block")).toBeNull();
  view.rerender(frame("已锁定"));
  assertGated();
  expect(screen.getByLabelText("开发服 工作台")).toBe(documentFrame);
});
