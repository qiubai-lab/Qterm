export interface VaultStatus { initialized: boolean; unlocked: boolean; legacy: boolean }

export interface FileOperationResult { completed: boolean }

export type CredentialKind = "password" | "privateKey";

export type GeneratedPrivateKeyAlgorithm = "ed25519" | "ecdsaP256" | "ecdsaP384" | "ecdsaP521";

export interface CredentialSummary { id: string; name: string; kind: CredentialKind; detail: string | null }

export interface PrivateKeyDraft { id: string; source: "file" | "generated"; label: string; detail: string }

export interface VaultStatusChanged { initialized?: boolean; legacy?: boolean; unlocked: boolean; reason: "manual" | "windowsSession" | "timeout" }
