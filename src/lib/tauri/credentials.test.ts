import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { cancelMasterPasswordReset, changeMasterPassword, clearVault, createPasswordCredential, getCredentialPublicKey, importPrivateKeyCredential, prepareMasterPasswordReset, resetMasterPassword } from "./credentials";

describe("credential vault IPC client", () => {
  beforeEach(() => invoke.mockReset());

  it("creates a named password credential through the narrow vault command", async () => {
    invoke.mockResolvedValue(undefined);
    await createPasswordCredential("Production", "connection-secret");
    expect(invoke).toHaveBeenCalledWith("credential_create_password", { input: { name: "Production", password: "connection-secret" } });
  });

  it("imports private keys without passing a path or key body from the frontend", async () => {
    invoke.mockResolvedValue(undefined);
    await importPrivateKeyCredential("Deploy", "key-secret");
    expect(invoke).toHaveBeenCalledWith("credential_import_private_key", { input: { name: "Deploy", passphrase: "key-secret" } });
  });

  it("requires the destructive confirmation phrase when clearing", async () => {
    invoke.mockResolvedValue(undefined);
    await clearVault("确认清除");
    expect(invoke).toHaveBeenCalledWith("credential_vault_clear", { input: { confirmation: "确认清除" } });
  });

  it("changes the master password through a narrow secret DTO", async () => {
    invoke.mockResolvedValue(undefined);
    await changeMasterPassword("old-master-password", "new-master-password");
    expect(invoke).toHaveBeenCalledWith("credential_vault_change_master_password", { input: { oldPassword: "old-master-password", newPassword: "new-master-password" } });
  });

  it("requests only the selected credential id when deriving a public key", async () => {
    invoke.mockResolvedValue("ssh-ed25519 AAAA");
    await getCredentialPublicKey("key-1");
    expect(invoke).toHaveBeenCalledWith("credential_public_key", { input: { credentialId: "key-1" } });
  });

  it("prepares, commits, and cancels recovery without passing file data through the frontend", async () => {
    invoke.mockResolvedValue({ completed: true });
    await prepareMasterPasswordReset();
    await resetMasterPassword("new-master-password");
    await cancelMasterPasswordReset();
    expect(invoke).toHaveBeenNthCalledWith(1, "credential_vault_prepare_master_password_reset");
    expect(invoke).toHaveBeenCalledWith("credential_vault_reset_master_password", { input: { newPassword: "new-master-password" } });
    expect(invoke).toHaveBeenNthCalledWith(3, "credential_vault_cancel_master_password_reset");
  });
});
