import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface VaultStatus { initialized: boolean; unlocked: boolean; legacy: boolean }
export interface FileOperationResult { completed: boolean }
export type CredentialKind = "password" | "privateKey";
export type GeneratedPrivateKeyAlgorithm = "ed25519" | "ecdsaP256";
export interface CredentialSummary { id: string; name: string; kind: CredentialKind; detail: string | null }
export interface PrivateKeyDraft { id: string; source: "file" | "generated"; label: string; detail: string }
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
export const preparePrivateKeyCredential = (): Promise<PrivateKeyDraft | null> => invoke("credential_prepare_private_key");
export const prepareDroppedPrivateKeyCredential = (path: string): Promise<PrivateKeyDraft> => invoke("credential_prepare_private_key_path", { input: { path } });
export const prepareGeneratedPrivateKeyCredential = (algorithm: GeneratedPrivateKeyAlgorithm, comment?: string): Promise<PrivateKeyDraft> => invoke("credential_prepare_generated_private_key", { input: { algorithm, comment: comment || null } });
export const commitPrivateKeyCredential = (draftId: string, name: string, passphrase?: string): Promise<CredentialSummary> => invoke("credential_commit_private_key", { input: { draftId, name, passphrase: passphrase || null } });
export const cancelPrivateKeyCredential = (draftId: string): Promise<void> => invoke("credential_cancel_private_key", { input: { draftId } });
export const revealCredentialPassword = (credentialId: string): Promise<string> => invoke("credential_reveal_password", { input: { credentialId } });
export const getCredentialPublicKey = (credentialId: string): Promise<string> => invoke("credential_public_key", { input: { credentialId } });
export const deleteCredential = (credentialId: string): Promise<void> => invoke("credential_delete", { input: { credentialId } });
