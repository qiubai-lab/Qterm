import { fireEvent, render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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
