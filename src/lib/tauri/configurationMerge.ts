import { invoke } from "@tauri-apps/api/core";

export interface MergeOptions { connections: boolean; network: boolean; credentials: boolean }
export interface MergeCategory { count: number; error: string | null }
export interface MergeScan { source: string; connections: MergeCategory; network: MergeCategory; credentials: MergeCategory }
export interface MergeDetail { category: "groups" | "connections" | "network" | "credentials"; name: string; targetName: string; outcome: "added" | "skipped" | "renamed" | "invalid"; note: string }
export interface MergePreview { token: string; changed: boolean; details: MergeDetail[] }

export const selectMergeSource = (): Promise<MergeScan | null> => invoke("configuration_merge_select");
export const previewConfigurationMerge = (options: MergeOptions, sourcePassword: string): Promise<MergePreview> => invoke("configuration_merge_preview", { input: { ...options, sourcePassword: sourcePassword || null } });
export const commitConfigurationMerge = (token: string): Promise<void> => invoke("configuration_merge_commit", { token });
export const cancelConfigurationMerge = (): Promise<void> => invoke("configuration_merge_cancel");

export const CONFIGURATION_MERGED = "qterm:configuration-merged";

export const unlockMergeSourceCredentials = (password: string): Promise<void> => invoke("configuration_merge_unlock_source", { password });
