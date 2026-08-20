import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ unlockVault: vi.fn() }));

vi.mock("../../lib/tauri/credentials", () => ({ unlockVault: mocks.unlockVault }));

import { TerminalLockChoiceDialog, TerminalLockScreen } from "./TerminalLockDialogs";

beforeEach(() => mocks.unlockVault.mockReset().mockResolvedValue(undefined));
afterEach(cleanup);

describe("TerminalLockChoiceDialog", () => {
  it("keeps terminal locking available when the vault is already locked", () => {
    render(<TerminalLockChoiceDialog vaultUnlocked={false} busy={false} message="" onClose={vi.fn()} onLockVault={vi.fn()} onLockTerminalAndVault={vi.fn()}/>);

    expect(screen.getByRole("button", { name: "锁定凭证库" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "锁定终端和凭证" })).toBeEnabled();
  });
});

describe("TerminalLockScreen", () => {
  it("clears the submitted master password before completing verification", async () => {
    const user = userEvent.setup();
    render(<TerminalLockScreen onUnlocked={vi.fn()}/>);

    const input = screen.getByLabelText("主密码");
    await user.type(input, "correct-password");
    fireEvent.submit(screen.getByLabelText("主密码").closest("form")!);

    expect(input).toHaveValue("");
    expect(mocks.unlockVault).toHaveBeenCalledWith("correct-password");
  });

  it("keeps the non-dismissible lock screen visible after invalid input", async () => {
    const user = userEvent.setup();
    render(<TerminalLockScreen onUnlocked={vi.fn()}/>);

    await user.type(screen.getByLabelText("主密码"), "short");
    fireEvent.submit(screen.getByLabelText("主密码").closest("form")!);

    const alert = screen.getByRole("alert");
    const action = screen.getByRole("button", { name: "解锁终端和凭证" });
    expect(alert).toHaveTextContent("主密码至少需要 12 个字符");
    expect(alert.closest("footer")).toBe(action.closest("footer"));
    expect(mocks.unlockVault).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "终端已锁定" })).toBeInTheDocument();
    expect(action).toBeEnabled();
  });

});
