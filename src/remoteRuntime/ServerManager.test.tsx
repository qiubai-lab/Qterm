import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ServerManager } from "./ServerManager";
afterEach(cleanup);
const entry = {id:"a",name:"生产服务器",endpoint:"https://server.example"};
it("saves addresses without credentials and connects the selected entry", async () => {
  const save = vi.fn(), connect = vi.fn().mockResolvedValue(undefined);
  render(<ServerManager entries={[]} initialNew onSave={save} onConnect={connect} onClose={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText("服务器地址"), {target:{value:"http://test.example:8080"}});
  fireEvent.change(screen.getByLabelText("显示名称"), {target:{value:"测试"}});
  fireEvent.click(screen.getByRole("button",{name:"连接"}));
  await waitFor(() => expect(connect).toHaveBeenCalledWith(expect.objectContaining({name:"测试",endpoint:"http://test.example:8080"})));
  expect(save.mock.calls[0][0][0]).not.toHaveProperty("password");
});
it("rejects duplicate endpoints without overwriting another server", async () => {
  const save=vi.fn();
  render(<ServerManager entries={[entry]} initialNew onSave={save} onConnect={vi.fn()} onClose={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText("服务器地址"), {target:{value:entry.endpoint}});
  fireEvent.click(screen.getByRole("button",{name:"保存"}));
  expect(await screen.findByText("这个服务器地址已经保存")).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
it("protects the active server address and deletion", () => {
  render(<ServerManager entries={[entry]} activeId="a" initialNew={false} onSave={vi.fn()} onConnect={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.getByLabelText("服务器地址")).toBeDisabled();
  expect(screen.getByRole("button",{name:"删除"})).toBeDisabled();
});

it("offers the next preset beside the name and saves custom colors or no color", () => {
  const save = vi.fn();
  render(<ServerManager initialNew entries={[{...entry, tabColor: "#81a9cd"}]} onSave={save} onConnect={vi.fn()} onClose={vi.fn()}/>);
  const picker = screen.getByRole("combobox", {name: "标签颜色"});
  expect(picker).toHaveValue("#8db69b");
  fireEvent.change(screen.getByLabelText("服务器地址"), {target: {value: "https://second.test"}});
  fireEvent.change(screen.getByLabelText("自定义标签颜色"), {target: {value: "#334455"}});
  fireEvent.click(screen.getByRole("button", {name: "保存"}));
  expect(save.mock.lastCall?.[0][0].tabColor).toBe("#334455");
  fireEvent.change(picker, {target: {value: ""}});
  fireEvent.click(screen.getByRole("button", {name: "保存"}));
  expect(save.mock.lastCall?.[0][0].tabColor).toBeNull();
});
