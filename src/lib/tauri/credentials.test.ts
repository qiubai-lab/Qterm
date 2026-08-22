import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { cancelMasterPasswordReset, cancelPrivateKeyCredential, changeMasterPassword, clearVault, commitPrivateKeyCredential, createPasswordCredential, getCredentialPublicKey, prepareDroppedPrivateKeyCredential, prepareGeneratedPrivateKeyCredential, prepareMasterPasswordReset, preparePrivateKeyCredential, resetMasterPassword } from "./credentials";

describe("credential vault IPC client", () => {
  beforeEach(() => invoke.mockReset());

  it("creates a named password credential through the narrow vault command", async () => {
    invoke.mockResolvedValue(undefined);
    await createPasswordCredential("Production", "connection-secret");
    expect(invoke).toHaveBeenCalledWith("credential_create_password", { input: { name: "Production", password: "connection-secret" } });
  });

  it("prepares a selected private key without passing a path or key body from the frontend", async () => {
    invoke.mockResolvedValue(undefined);
    await preparePrivateKeyCredential();
    expect(invoke).toHaveBeenCalledWith("credential_prepare_private_key");
  });

  it("prepares dropped and generated drafts, then commits or cancels only by opaque id", async () => {
    invoke.mockResolvedValue(undefined);
    await prepareDroppedPrivateKeyCredential("C:/keys/id_ed25519");
    await prepareGeneratedPrivateKeyCredential("ecdsaP256", "deploy@example");
    await commitPrivateKeyCredential("draft-1", "Deploy", "key-secret");
    await cancelPrivateKeyCredential("draft-1");
    expect(invoke).toHaveBeenNthCalledWith(1, "credential_prepare_private_key_path", { input: { path: "C:/keys/id_ed25519" } });
    expect(invoke).toHaveBeenNthCalledWith(2, "credential_prepare_generated_private_key", { input: { algorithm: "ecdsaP256", comment: "deploy@example" } });
    expect(invoke).toHaveBeenNthCalledWith(3, "credential_commit_private_key", { input: { draftId: "draft-1", name: "Deploy", passphrase: "key-secret" } });
    expect(invoke).toHaveBeenNthCalledWith(4, "credential_cancel_private_key", { input: { draftId: "draft-1" } });
  });

  it("generates private keys through a closed algorithm DTO without returning key material", async () => {
    invoke.mockResolvedValue({ id: "key-2", name: "Generated", kind: "privateKey", detail: "ecdsa-p256" });
    await prepareGeneratedPrivateKeyCredential("ecdsaP384", "deploy@example");
    await prepareGeneratedPrivateKeyCredential("ecdsaP521", "deploy@example");
    expect(invoke).toHaveBeenNthCalledWith(1, "credential_prepare_generated_private_key", { input: { algorithm: "ecdsaP384", comment: "deploy@example" } });
    expect(invoke).toHaveBeenNthCalledWith(2, "credential_prepare_generated_private_key", { input: { algorithm: "ecdsaP521", comment: "deploy@example" } });
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
