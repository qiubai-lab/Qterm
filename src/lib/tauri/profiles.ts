import { invoke } from "@tauri-apps/api/core";

export type AuthPreference = "password" | "privateKey" | "sshAgent" | "manual";

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authPreference: AuthPreference;
  credentialId?: string | null;
  groupId: string | null;
}

export interface ProfileInput {
  name: string;
  host: string;
  port: number;
  username: string;
  authPreference: AuthPreference;
  credentialId?: string | null;
  groupId: string | null;
}

export interface ProfileGroup {
  id: string;
  name: string;
}

export interface IpcError {
  code: string;
  message: string;
  retryable: boolean;
}

export function listProfiles(): Promise<ConnectionProfile[]> {
  return invoke<ConnectionProfile[]>("profile_list");
}

export function createProfile(input: ProfileInput): Promise<ConnectionProfile> {
  return invoke<ConnectionProfile>("profile_create", { input });
}

export function updateProfile(
  id: string,
  input: ProfileInput,
): Promise<ConnectionProfile> {
  return invoke<ConnectionProfile>("profile_update", { id, input });
}

export function deleteProfile(id: string): Promise<void> {
  return invoke<void>("profile_delete", { id });
}

export function listProfileGroups(): Promise<ProfileGroup[]> {
  return invoke<ProfileGroup[]>("profile_group_list");
}

export function createProfileGroup(name: string): Promise<ProfileGroup> {
  return invoke<ProfileGroup>("profile_group_create", { input: { name } });
}

export function updateProfileGroup(id: string, name: string): Promise<ProfileGroup> {
  return invoke<ProfileGroup>("profile_group_update", { id, input: { name } });
}

export function deleteProfileGroup(id: string): Promise<void> {
  return invoke<void>("profile_group_delete", { id });
}
