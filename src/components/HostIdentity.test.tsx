import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HostIdentity } from "./HostIdentity";

const mocks = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: mocks.writeText }));

const profile = { name: "Production", username: "deploy", host: "prod.example", port: 2222 };

describe("HostIdentity", () => {
  afterEach(() => {
    cleanup();
    mocks.writeText.mockReset();
  });

  it("opens one host summary and copies only the target host", async () => {
    const user = userEvent.setup();
    mocks.writeText.mockResolvedValue(undefined);
    render(<HostIdentity profile={profile}/>);

    const trigger = screen.getByRole("button", { name: /查看 Production 主机概要/ });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Production" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveTextContent("deploy");
    expect(dialog).toHaveTextContent("prod.example");
    expect(dialog).toHaveTextContent("2222");
    expect(dialog).toHaveTextContent("deploy@prod.example:2222");

    const copyButton = screen.getByRole("button", { name: "复制主机地址" });
    expect(copyButton).toHaveClass("host-summary-copy-action");
    await user.click(copyButton);
    expect(mocks.writeText).toHaveBeenCalledWith("prod.example");
    expect(await screen.findByRole("status")).toHaveTextContent("主机地址已复制");
    expect(screen.getByRole("button", { name: "已复制" })).toBe(copyButton);
  });

  it("keeps a destructive host action inside the summary card", async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    render(<HostIdentity profile={profile} dangerAction={{ label: "断开连接", onSelect: onDisconnect }}/>);

    await user.click(screen.getByRole("button", { name: /查看 Production 主机概要/ }));
    await user.click(screen.getByRole("button", { name: "断开连接" }));

    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Production" })).not.toBeInTheDocument();
  });

  it("reports clipboard failure and closes from Escape with focus restored", async () => {
    const user = userEvent.setup();
    mocks.writeText.mockRejectedValue(new Error("clipboard unavailable"));
    render(<HostIdentity profile={profile} label="deploy@prod.example"/>);

    const trigger = screen.getByRole("button", { name: /deploy@prod.example/ });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "复制主机地址" }));
    expect(await screen.findByRole("status")).toHaveTextContent("复制失败，请重试");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Production" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes when the user presses outside the popover", async () => {
    const user = userEvent.setup();
    render(<div><HostIdentity profile={profile}/><button type="button">外部操作</button></div>);
    await user.click(screen.getByRole("button", { name: /查看 Production 主机概要/ }));
    await user.click(screen.getByRole("button", { name: "外部操作" }));
    expect(screen.queryByRole("dialog", { name: "Production" })).not.toBeInTheDocument();
  });
});
