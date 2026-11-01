import { render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect,it,vi } from "vitest";
import { AccessTakeoverDialog } from "./AccessTakeoverDialog";
it("offers cancellation or one explicit takeover and keeps pending submission disabled",async()=>{
  const cancel=vi.fn(),takeover=vi.fn(),user=userEvent.setup();
  const view=render(<AccessTakeoverDialog busy={false} onCancel={cancel} onTakeover={takeover}/>);
  expect(screen.getByRole("dialog",{name:"当前工作台正在使用中"})).toBeInTheDocument();
  expect(takeover).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"取消"}));expect(cancel).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button",{name:"直接接管"}));expect(takeover).toHaveBeenCalledOnce();
  view.rerender(<AccessTakeoverDialog busy onCancel={cancel} onTakeover={takeover}/>);
  expect(screen.getByRole("button",{name:"直接接管"})).toBeDisabled();
});
