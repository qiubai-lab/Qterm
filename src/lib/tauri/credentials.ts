import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface VaultStatus { initialized: boolean; unlocked: boolean; legacy: boolean }
export interface FileOperationResult { completed: boolean }
export type CredentialKind = "password" | "privateKey";
export interface CredentialSummary { id: string; name: string; kind: CredentialKind; detail: string | null }
export interface VaultStatusChanged { unlocked: boolean; reason: "manual" | "windowsSession" | "timeout" }

export const getVaultStatus = (): Promise<VaultStatus> => invoke("credential_vault_status");
export const initializeVault = (masterPassword: string): Promise<FileOperationResult> => invoke("credential_vault_initialize", { input: { masterPassword } });
export const unlockVault = (masterPassword: string): Promise<void> => invoke("credential_vault_unlock", { input: { masterPassword } });
export const lockVault = (): Promise<void> => invoke("credential_vault_lock");
export const changeMasterPassword = (oldPassword: string, newPassword: string): Promise<void> => invoke("credential_vault_change_master_password", { input: { oldPassword, newPassword } });
export const prepareMasterPasswordReset = (): Promise<FileOperationResult> => invoke("credential_vault_prepare_master_password_reset");
export const resetMasterPassword = (newPassword: string): Promise<FileOperationResult> => invoke("credential_vault_reset_master_password", { input: { newPassword } });
export const cancelMasterPasswordReset = (): Promise<void> => invoke("credential_vault_cancel_master_password_reset");
export const clearVault = (confirmation: string): Promise<void> => invoke("credential_vault_clear", { input: { confirmation } });
export const onVaultStatusChanged = (handler: (event: VaultStatusChanged) => void): Promise<UnlistenFn> => listen<VaultStatusChanged>("credential-vault-status-changed", (event) => handler(event.payload));
export const listCredentials = (): Promise<CredentialSummary[]> => invoke("credential_list");
export const createPasswordCredential = (name: string, password: string): Promise<CredentialSummary> => invoke("credential_create_password", { input: { name, password } });
export const importPrivateKeyCredential = (name: string, passphrase?: string): Promise<CredentialSummary | null> => invoke("credential_import_private_key", { input: { name, passphrase: passphrase || null } });
export const revealCredentialPassword = (credentialId: string): Promise<string> => invoke("credential_reveal_password", { input: { credentialId } });
export const getCredentialPublicKey = (credentialId: string): Promise<string> => invoke("credential_public_key", { input: { credentialId } });
export const deleteCredential = (credentialId: string): Promise<void> => invoke("credential_delete", { input: { credentialId } });
