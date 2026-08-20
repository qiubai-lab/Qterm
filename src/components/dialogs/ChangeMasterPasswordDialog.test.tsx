import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { ChangeMasterPasswordDialog } from "./ChangeMasterPasswordDialog";

const mocks = vi.hoisted(() => ({ changeMasterPassword: vi.fn() }));
vi.mock("../../lib/tauri/credentials", () => mocks);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("verifies the old password and matching new password before migration", async () => {
  const user = userEvent.setup();
  mocks.changeMasterPassword.mockResolvedValue(undefined);
  const onSuccess = vi.fn();
  render(<ChangeMasterPasswordDialog onClose={vi.fn()} onSuccess={onSuccess}/>);
  await user.type(screen.getByLabelText("旧主密码"), "old-master-password");
  await user.type(screen.getByLabelText("新主密码"), "new-master-password");
  await user.type(screen.getByLabelText("确认新主密码"), "new-master-password");
  await user.click(screen.getByRole("button", { name: "确认修改" }));
  await waitFor(() => expect(mocks.changeMasterPassword).toHaveBeenCalledWith("old-master-password", "new-master-password"));
  expect(onSuccess).toHaveBeenCalledOnce();
});
