import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NetworkRuleTypeDialog } from "./NetworkRuleTypeDialog";

describe("NetworkRuleTypeDialog", () => {
  afterEach(cleanup);

  it("maps each explanatory entry to its network rule type", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NetworkRuleTypeDialog onClose={vi.fn()} onSelect={onSelect}/>);

    await user.click(screen.getByRole("button", { name: /SOCKS5 动态代理/ }));
    await user.click(screen.getByRole("button", { name: /本地端口转发/ }));
    await user.click(screen.getByRole("button", { name: /远程端口转发/ }));
    expect(onSelect.mock.calls.map(([type]) => type)).toEqual(["socks5", "local", "remote"]);
  });

  it("previews every mode with device icons and endpoint role labels", () => {
    render(<NetworkRuleTypeDialog onClose={vi.fn()} onSelect={vi.fn()}/>);

    const socksRoute = screen.getByLabelText("本地 → 服务器网络");
    expect(socksRoute.querySelector('[data-icon="computer"]')).toBeInTheDocument();
    expect(socksRoute.querySelector('[data-icon="server"]')).toBeInTheDocument();
    expect(socksRoute).toHaveTextContent("本地→服务器网络");

    const localRoute = screen.getByLabelText("本地 → 服务器");
    expect(localRoute.querySelector('[data-icon="computer"]')).toBeInTheDocument();
    expect(localRoute.querySelector('[data-icon="server"]')).toBeInTheDocument();
    expect(localRoute).toHaveTextContent("本地→服务器");

    const remoteRoute = screen.getByLabelText("服务器 → 本地");
    expect(remoteRoute.querySelector('[data-icon="server"]')).toBeInTheDocument();
    expect(remoteRoute.querySelector('[data-icon="computer"]')).toBeInTheDocument();
    expect(remoteRoute).toHaveTextContent("服务器→本地");
    expect(screen.queryByText(/127\.0\.0\.1|localhost|动态目标/)).not.toBeInTheDocument();
  });
});
