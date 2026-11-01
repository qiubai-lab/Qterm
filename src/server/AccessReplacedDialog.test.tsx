import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AccessReplacedDialog } from "./AccessReplacedDialog";

it("requires the confirmation button instead of Escape or backdrop dismissal", async () => {
  const confirm = vi.fn();
  const user = userEvent.setup();
  render(<AccessReplacedDialog onConfirm={confirm}/>);
  const dialog = screen.getByRole("dialog", { name: "连接已被接管" });
  const button = screen.getByRole("button", { name: "确认" });
  expect(button).toHaveFocus();
  expect(screen.queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}{Tab}");
  await user.click(dialog.parentElement!);
  expect(confirm).not.toHaveBeenCalled();
  await user.click(button);
  expect(confirm).toHaveBeenCalledOnce();
});
