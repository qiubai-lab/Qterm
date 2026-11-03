import { cleanup,render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach,expect,it,vi } from "vitest";
import { AccessTakeoverDialog } from "./AccessTakeoverDialog";
afterEach(cleanup);
it("focuses takeover so Enter does not dismiss the login flow", async () => {
  const cancel = vi.fn(), takeover = vi.fn(), user = userEvent.setup();
  const view = render(<AccessTakeoverDialog busy={false} onCancel={cancel} onTakeover={takeover}/>);
  expect(screen.getByRole("button", { name: "直接接管" })).toHaveFocus();
  expect(takeover).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  expect(takeover).toHaveBeenCalledOnce();
  expect(cancel).not.toHaveBeenCalled();
  view.rerender(<AccessTakeoverDialog busy onCancel={cancel} onTakeover={takeover}/>);
  await user.keyboard("{Enter}");
  expect(takeover).toHaveBeenCalledOnce();
});
it("preserves explicit keyboard cancellation with Escape", async () => {
  const cancel = vi.fn(), takeover = vi.fn();
  render(<AccessTakeoverDialog busy={false} onCancel={cancel} onTakeover={takeover}/>);
  await userEvent.setup().keyboard("{Escape}");
  expect(cancel).toHaveBeenCalledOnce();
  expect(takeover).not.toHaveBeenCalled();
});
it("offers cancellation or one explicit takeover and keeps pending submission disabled",async()=>{
  const cancel=vi.fn(),takeover=vi.fn(),user=userEvent.setup();
  const view=render(<AccessTakeoverDialog busy={false} onCancel={cancel} onTakeover={takeover}/>);
  expect(screen.getByRole("dialog",{name:"当前工作台正在使用中"})).toBeInTheDocument();
  expect(screen.getByText("若凭证库已初始化，接管后需验证主密码才能使用工作台。")).toBeInTheDocument();
  expect(takeover).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"取消"}));expect(cancel).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button",{name:"直接接管"}));expect(takeover).toHaveBeenCalledOnce();
  view.rerender(<AccessTakeoverDialog busy onCancel={cancel} onTakeover={takeover}/>);
  expect(screen.getByRole("button",{name:"直接接管"})).toBeDisabled();
});
