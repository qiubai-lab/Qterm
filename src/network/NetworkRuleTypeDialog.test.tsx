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
});
