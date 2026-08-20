import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NetworkRuleDialog } from "./NetworkRuleDialog";

describe("NetworkRuleDialog", () => {
  afterEach(cleanup);
  it("uses loopback defaults and warns before saving an exposed listener", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NetworkRuleDialog profileId="profile-1" rule={null} busy={false} message="" onClose={vi.fn()} onSave={onSave}/>);
    expect(screen.getByLabelText("监听地址")).toHaveValue("127.0.0.1");
    expect(screen.getByText("当前监听地址仅允许本机访问。")).toBeInTheDocument();
    await user.type(screen.getByLabelText("名称"), "Public tunnel");
    await user.clear(screen.getByLabelText("监听地址"));
    await user.type(screen.getByLabelText("监听地址"), "0.0.0.0");
    expect(screen.getByText("该监听地址可能向其他设备暴露服务；请确认网络与防火墙策略。")).toBeInTheDocument();
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
    render(<NetworkRuleDialog profileId="profile-1" rule={null} busy={false} message="" onClose={vi.fn()} onSave={onSave}/>);
    await user.type(screen.getByLabelText("名称"), "Invalid");
    await user.clear(screen.getByLabelText("监听端口"));
    await user.type(screen.getByLabelText("监听端口"), "0");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(screen.getByText("请填写名称、监听地址和 1–65535 端口")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
