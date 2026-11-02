import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CredentialDialog } from "./CredentialDialog";

const mocks = vi.hoisted(() => ({ status: vi.fn(), list: vi.fn(), unlock: vi.fn(), initialize: vi.fn() }));
vi.mock("@qterm/services/credentials", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/tauri/credentials")>(),
  getVaultStatus: mocks.status,
  listCredentials: mocks.list,
  unlockVault: mocks.unlock,
  initializeVault: mocks.initialize,
  onVaultStatusChanged: async () => () => undefined,
}));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return open ? <CredentialDialog onClose={() => { onClose(); setOpen(false); }}/> : <div>终端工作台</div>;
}

for (const initialized of [true, false]) {
  it.each(["close", "cancel", "escape", "backdrop"])(`dismisses only the ${initialized ? "unlock" : "initialize"} dialog via %s`, async action => {
    mocks.status.mockResolvedValue({ initialized, unlocked: false, legacy: false });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose}/>);
    const manager = await screen.findByRole("dialog", { name: "凭证管理" });
    const triggerName = initialized ? "解锁凭证库" : "初始化凭证库";
    const childTitle = initialized ? "解锁密码保险库" : "初始化密码保险库";
    if (initialized) await user.click(await screen.findByRole("button", { name: triggerName }));
    const child = await screen.findByRole("dialog", { name: childTitle });
    await user.type(within(child).getByLabelText("主密码"), "unsaved-password");

    if (action === "close") await user.click(within(child).getByRole("button", { name: "关闭" }));
    else if (action === "cancel") await user.click(within(child).getByRole("button", { name: "取消" }));
    else if (action === "escape") await user.keyboard("{Escape}");
    else await user.click(child.parentElement!);

    expect(screen.queryByRole("dialog", { name: childTitle })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "凭证管理" })).toBe(manager);
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.unlock).not.toHaveBeenCalled();
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    const trigger = within(manager).getByRole("button", { name: triggerName });
    if (initialized && action !== "backdrop") expect(trigger).toHaveFocus();

    await user.click(trigger);
    const reopened = screen.getByRole("dialog", { name: childTitle });
    expect(within(reopened).getByLabelText("主密码")).toHaveValue("");
    await user.click(within(reopened).getByRole("button", { name: "取消" }));
    expect(trigger).toHaveFocus();
    await user.click(within(manager).getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("终端工作台")).toBeInTheDocument();
  });
}
