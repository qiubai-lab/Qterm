export type * from "../contracts/profiles";
import type { ConnectionProfile, ProfileInput, JumpCandidate, ProfileRouteRequirements, ProfileGroup, SshConfigPreview, SshConfigImportItem, SshConfigImportResult, ProfileDeleteResult } from "../contracts/profiles";
import { invoke } from "@tauri-apps/api/core";

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
