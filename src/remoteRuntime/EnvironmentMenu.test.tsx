import { fireEvent, render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { reportWorkbenchPointer } from "./desktop/framePointer";
import { EnvironmentMenu } from "./EnvironmentMenu";
afterEach(cleanup);
const servers = [{id:"home",name:"HOME",endpoint:"https://home.example"}];
function setup() {
  const onChoose = vi.fn();
  render(<EnvironmentMenu anchor={new DOMRect(600, 0, 28, 28)} current={null} status="本机" servers={servers} onChoose={onChoose} onManage={vi.fn()} onClose={vi.fn()}/>);
  return {onChoose};
}
it("opens with focus on the menu instead of highlighting the first server", () => {
  setup();
  expect(screen.getByRole("menu")).toHaveFocus();
  expect(screen.getByRole("menuitem", {name:/HOME/})).not.toHaveFocus();
  fireEvent.keyDown(screen.getByRole("menu"), {key:"ArrowDown"});
  expect(screen.getByRole("menuitem", {name:/HOME/})).toHaveFocus();
});
it("opens the server submenu on hover and selects an existing server", () => {
  const {onChoose} = setup();
  fireEvent.pointerEnter(screen.getByRole("menuitem", {name:"连接服务器…"}));
  const submenu = screen.getByRole("menu", {name:"连接服务器"});
  fireEvent.click(within(submenu).getByRole("menuitem", {name:/HOME/}));
  expect(onChoose).toHaveBeenCalledWith(servers[0]);
});
it("supports keyboard entry and return without an add-server action", () => {
  setup();
  const trigger = screen.getByRole("menuitem", {name:"连接服务器…"});
  trigger.focus();
  fireEvent.keyDown(trigger, {key:"ArrowRight"});
  const submenu = screen.getByRole("menu", {name:"连接服务器"});
  expect(within(submenu).getByRole("menuitem", {name:/HOME/})).toHaveFocus();
  fireEvent.keyDown(submenu, {key:"ArrowLeft"});
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("menu", {name:"连接服务器"})).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.queryByRole("menuitem", {name:"添加服务器…"})).not.toBeInTheDocument();
});

it("dismisses both menus from inside a remote document and delivers the original terminal click", () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return <><iframe title="远程终端"/>{open && <EnvironmentMenu anchor={new DOMRect()} current={servers[0]} status="已连接"
      servers={servers} onChoose={vi.fn()} onManage={vi.fn()} onClose={() => setOpen(false)}/>}</>;
  }
  render(<Harness/>);
  fireEvent.pointerEnter(screen.getByRole("menuitem", {name:"连接服务器…"}));
  expect(screen.getAllByRole("menu")).toHaveLength(2);
  const frame = screen.getByTitle("远程终端") as HTMLIFrameElement;
  const member = frame.contentWindow!;
  const terminal = frame.contentDocument!.createElement("button");
  frame.contentDocument!.body.append(terminal);
  const received = vi.fn((event: Event) => event.stopPropagation());
  terminal.addEventListener("pointerdown", received);
  member.addEventListener("pointerdown", reportWorkbenchPointer, true);
  fireEvent.pointerDown(terminal);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(received).toHaveBeenCalledOnce();
});

it("marks every online server, including connected choices in the submenu", () => {
  const second = { id: "b", name: "测试服", endpoint: "https://b.test" };
  const offline = { id: "c", name: "离线服", endpoint: "https://c.test" };
  render(<EnvironmentMenu anchor={new DOMRect()} current={servers[0]} status="已连接" servers={[...servers, second, offline]}
    connected={[...servers, second].map(entry => ({entry, status: "已连接"}))} onChoose={vi.fn()} onManage={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.getByRole("menuitem", {name:/^HOME/})).toHaveAttribute("data-connected");
  expect(screen.getByRole("menuitem", {name:/^测试服/})).toHaveAttribute("data-connected");
  fireEvent.pointerEnter(screen.getByRole("menuitem", {name:"连接服务器…"}));
  const list = within(screen.getByRole("menu", {name:"连接服务器"}));
  expect(list.getByRole("menuitem", {name:/测试服/})).toHaveAttribute("data-connected");
  expect(list.getByRole("menuitem", {name:/离线服/})).not.toHaveAttribute("data-connected");
});
