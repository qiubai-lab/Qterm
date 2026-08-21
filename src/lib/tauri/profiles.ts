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
  jumpProfileIds?: string[];
}

export interface ProfileInput {
  name: string;
  host: string;
  port: number;
  username: string;
  authPreference: AuthPreference;
  credentialId?: string | null;
  groupId: string | null;
  jumpProfileIds: string[];
}

export interface JumpCandidate {
  profile: ConnectionProfile;
  selectable: boolean;
  reasonCode: string | null;
  reason: string | null;
  usesCredential: boolean;
  routeNames: string[];
}

export interface ProfileRouteRequirements {
  usesCredential: boolean;
  routeNames: string[];
}

export interface ProfileGroup {
  id: string;
  name: string;
}

export type SshConfigIdentityStatus = "available" | "unavailable" | "tooLarge" | "dynamicPath";

export interface SshConfigIdentity {
  index: number;
  fileName: string;
  status: SshConfigIdentityStatus;
}

export interface SshConfigCandidate {
  alias: string;
  name: string;
  host: string;
  port: number;
  username: string;
  alreadyImported: boolean;
  importable: boolean;
  identities: SshConfigIdentity[];
  warnings: string[];
}

export interface SshConfigPreview {
  previewId: string;
  sourceName: string;
  candidates: SshConfigCandidate[];
  warnings: string[];
}

export interface SshConfigImportItem {
  alias: string;
  identityFileIndex: number | null;
  passphrase: string | null;
}

export interface SshConfigImportResult {
  imported: number;
  importedPrivateKeys: number;
  reusedPrivateKeys: number;
}

export interface ProfileDeleteResult {
  deletedNetworkRules: number;
}

export interface IpcError {
  code: string;
  message: string;
  retryable: boolean;
}

export function listProfiles(): Promise<ConnectionProfile[]> {
  return invoke<ConnectionProfile[]>("profile_list");
}

export function listJumpCandidates(currentProfileId: string | null, selectedProfileIds: string[] = []): Promise<JumpCandidate[]> {
  return invoke<JumpCandidate[]>("profile_jump_candidates", { currentProfileId, selectedProfileIds });
}

export function getProfileRouteRequirements(profileId: string): Promise<ProfileRouteRequirements> {
  return invoke<ProfileRouteRequirements>("profile_route_requirements", { profileId });
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

export function deleteProfile(id: string): Promise<ProfileDeleteResult> {
  return invoke<ProfileDeleteResult>("profile_delete", { id });
}

export function clearUnsupportedProfileStorage(): Promise<void> {
  return invoke<void>("profile_clear_unsupported_storage");
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

export function previewSshConfigImport(): Promise<SshConfigPreview | null> {
  return invoke<SshConfigPreview | null>("profile_import_ssh_config_preview");
}

export function importSshConfig(
  previewId: string,
  items: SshConfigImportItem[],
): Promise<SshConfigImportResult> {
  return invoke<SshConfigImportResult>("profile_import_ssh_config_commit", {
    input: { previewId, items },
  });
}
