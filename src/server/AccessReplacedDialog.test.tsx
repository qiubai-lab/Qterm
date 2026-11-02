import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AccessReplacedDialog } from "./AccessReplacedDialog";
afterEach(cleanup);

it("requires the confirmation button instead of Escape or backdrop dismissal", async () => {
  const confirm = vi.fn();
  const user = userEvent.setup();
  render(<AccessReplacedDialog onConfirm={confirm}/>);
  const dialog = screen.getByRole("dialog", { name: "连接已被接管" });
  expect(screen.getByRole("heading", {name:"连接已被接管"}).querySelector('[data-icon="sync"]')).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "确认" });
  expect(button).toHaveFocus();
  expect(screen.queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}{Tab}");
  await user.click(dialog.parentElement!);
  expect(confirm).not.toHaveBeenCalled();
  await user.click(button);
  expect(confirm).toHaveBeenCalledOnce();
});

it.each([true, false])("shows a distinct disconnected title and icon (reconnecting=%s)", reconnecting => {
  render(<AccessReplacedDialog reason="disconnected" reconnecting={reconnecting} onConfirm={vi.fn()}/>);
  expect(screen.getByRole("dialog", {name:"连接已断开"})).toBeInTheDocument();
  expect(screen.getByRole("heading", {name:"连接已断开"}).querySelector('[data-icon="disconnect"]')).toBeInTheDocument();
  expect(screen.queryByText(/被接管/)).not.toBeInTheDocument();
  expect(screen.getByText(reconnecting ? "与服务端的连接中断，正在尝试重新连接" : "登录会话已失效，请重新登录")).toBeInTheDocument();
});
