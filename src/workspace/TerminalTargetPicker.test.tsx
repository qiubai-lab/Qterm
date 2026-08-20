import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TerminalTargetPicker } from "./TerminalTargetPicker";

const profiles = [
  { id: "profile-1", name: "Production", host: "prod.example", port: 22, username: "deploy", authPreference: "password" as const, credentialId: null, groupId: null },
];

describe("TerminalTargetPicker", () => {
  it("lists the local shell and saved connection profiles from the terminal name", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TerminalTargetPicker profiles={profiles} selectedProfileId={null} status="connected" detail="本机" onSelect={onSelect}/>);

    await user.click(screen.getByRole("button", { name: "选择终端连接，当前：本地终端" }));
    const menu = screen.getByRole("menu", { name: "终端连接" });
    expect(within(menu).getByRole("menuitemradio", { name: /本地终端/ })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByText("deploy@prod.example:22")).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitemradio", { name: /Production/ }));
    expect(onSelect).toHaveBeenCalledWith("profile-1");
    expect(screen.queryByRole("menu", { name: "终端连接" })).not.toBeInTheDocument();
  });

  it("uses a restrained menu affordance and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<TerminalTargetPicker profiles={profiles} selectedProfileId="profile-1" status="connected" detail="deploy@prod.example" onSelect={vi.fn()}/>);

    const trigger = screen.getByRole("button", { name: "选择终端连接，当前：Production" });
    expect(trigger.querySelector(".terminal-target-menu-icon svg")).toBeInTheDocument();
    expect(trigger.querySelector(".terminal-target-chevron")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("menu", { name: "终端连接" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "终端连接" })).not.toBeInTheDocument();
  });
});
