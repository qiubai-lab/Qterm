import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NetworkRuleDialog } from "./NetworkRuleDialog";

describe("NetworkRuleDialog", () => {
  afterEach(cleanup);
  it("shows local forwarding as a live flow from the local listener to the server-side target", async () => {
    const user = userEvent.setup();
    render(<NetworkRuleDialog profileId="profile-1" rule={null} initialType="local" busy={false} message="" onClose={vi.fn()} onSave={vi.fn()}/>);

    expect(screen.getByRole("img", { name: "浏览器 / 应用连接本机监听地址 127.0.0.1:8080，流量转发到服务器侧目标地址 localhost:80" })).toBeInTheDocument();
    expect(document.querySelectorAll(".network-rule-flow-connector")).toHaveLength(2);
    expect(document.querySelector(".network-rule-flow-arrow")).not.toBeInTheDocument();
    expect(screen.getByText("监听地址").querySelector('[data-icon="computer"]')).toBeInTheDocument();
    expect(screen.getByText("目标地址").querySelector('[data-icon="server"]')).toBeInTheDocument();

    await user.clear(screen.getByLabelText("目标地址"));
    await user.type(screen.getByLabelText("目标地址"), "intranet.example");
    await user.clear(screen.getByLabelText("目标端口"));
    await user.type(screen.getByLabelText("目标端口"), "443");
    expect(screen.getByRole("img", { name: /服务器侧目标地址 intranet\.example:443/ })).toBeInTheDocument();
  });

  it("shows remote forwarding with a server listener and a local target", () => {
    render(<NetworkRuleDialog profileId="profile-1" rule={null} initialType="remote" busy={false} message="" onClose={vi.fn()} onSave={vi.fn()}/>);

    expect(screen.getByRole("img", { name: "浏览器 / 应用连接服务器监听地址 127.0.0.1:8080，流量转发到本机目标地址 localhost:80" })).toBeInTheDocument();
    expect(screen.getByText("监听地址").querySelector('[data-icon="server"]')).toBeInTheDocument();
    expect(screen.getByText("目标地址").querySelector('[data-icon="computer"]')).toBeInTheDocument();
    expect(screen.getByText("当前监听地址仅允许服务器本机访问。")).toBeInTheDocument();
  });

  it("uses loopback defaults and warns before saving an exposed listener", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NetworkRuleDialog profileId="profile-1" rule={null} initialType="local" busy={false} message="" onClose={vi.fn()} onSave={onSave}/>);
    expect(screen.getByLabelText("监听地址")).toHaveValue("127.0.0.1");
    expect(screen.getByText("当前监听地址仅允许本机访问。")).toBeInTheDocument();
    await user.type(screen.getByLabelText("名称"), "Public tunnel");
    await user.clear(screen.getByLabelText("监听地址"));
    await user.type(screen.getByLabelText("监听地址"), "0.0.0.0");
    expect(screen.getByText("该监听地址可能向本机所在网络的其他设备暴露服务；请确认网络与防火墙策略。")).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(onSave).toHaveBeenCalledWith({
      type: "local",
      profileId: "profile-1",
      name: "Public tunnel",
      bindHost: "0.0.0.0",
      bindPort: 8080,
      targetHost: "localhost",
      targetPort: 80,
    });
  });

  it("validates the full port range before emitting a rule", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NetworkRuleDialog profileId="profile-1" rule={null} initialType="local" busy={false} message="" onClose={vi.fn()} onSave={onSave}/>);
    await user.type(screen.getByLabelText("名称"), "Invalid");
    await user.clear(screen.getByLabelText("监听端口"));
    await user.type(screen.getByLabelText("监听端口"), "0");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(screen.getByText("请填写名称、监听地址和 1–65535 端口")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("uses the selected SOCKS5 mode without exposing target fields and can return to mode selection", async () => {
    const onBack = vi.fn();
    render(<NetworkRuleDialog profileId="profile-1" rule={null} initialType="socks5" busy={false} message="" onBack={onBack} onClose={vi.fn()} onSave={vi.fn()}/>);

    expect(screen.getByText("SOCKS5 动态代理", { selector: ".network-rule-flow strong" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "本机应用连接本机 SOCKS5 127.0.0.1:1080，再通过服务器访问目标网络" })).toBeInTheDocument();
    expect(screen.getByLabelText("监听端口")).toHaveValue(1080);
    expect(screen.queryByLabelText("目标地址")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回选择" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
