// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/profiles";
import * as remote from "../../server/services/profiles";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/profiles";
export const listProfiles: typeof local.listProfiles = (...args) => (selectedRuntime ? remote.listProfiles : local.listProfiles)(...args);
export const listJumpCandidates: typeof local.listJumpCandidates = (...args) => (selectedRuntime ? remote.listJumpCandidates : local.listJumpCandidates)(...args);
export const getProfileRouteRequirements: typeof local.getProfileRouteRequirements = (...args) => (selectedRuntime ? remote.getProfileRouteRequirements : local.getProfileRouteRequirements)(...args);
export const createProfile: typeof local.createProfile = (...args) => (selectedRuntime ? remote.createProfile : local.createProfile)(...args);
export const updateProfile: typeof local.updateProfile = (...args) => (selectedRuntime ? remote.updateProfile : local.updateProfile)(...args);
export const deleteProfile: typeof local.deleteProfile = (...args) => (selectedRuntime ? remote.deleteProfile : local.deleteProfile)(...args);
export const clearUnsupportedProfileStorage: typeof local.clearUnsupportedProfileStorage = (...args) => (selectedRuntime ? remote.clearUnsupportedProfileStorage : local.clearUnsupportedProfileStorage)(...args);
export const listProfileGroups: typeof local.listProfileGroups = (...args) => (selectedRuntime ? remote.listProfileGroups : local.listProfileGroups)(...args);
export const createProfileGroup: typeof local.createProfileGroup = (...args) => (selectedRuntime ? remote.createProfileGroup : local.createProfileGroup)(...args);
export const updateProfileGroup: typeof local.updateProfileGroup = (...args) => (selectedRuntime ? remote.updateProfileGroup : local.updateProfileGroup)(...args);
export const deleteProfileGroup: typeof local.deleteProfileGroup = (...args) => (selectedRuntime ? remote.deleteProfileGroup : local.deleteProfileGroup)(...args);
export const previewSshConfigImport: typeof local.previewSshConfigImport = (...args) => (selectedRuntime ? remote.previewSshConfigImport : local.previewSshConfigImport)(...args);
export const importSshConfig: typeof local.importSshConfig = (...args) => (selectedRuntime ? remote.importSshConfig : local.importSshConfig)(...args);
