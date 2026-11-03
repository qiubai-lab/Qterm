// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/configurationMerge";
import * as remote from "../../server/services/configurationMerge";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/configurationMerge";
export const selectMergeSource: typeof local.selectMergeSource = (...args) => (selectedRuntime ? remote.selectMergeSource : local.selectMergeSource)(...args);
export const previewConfigurationMerge: typeof local.previewConfigurationMerge = (...args) => (selectedRuntime ? remote.previewConfigurationMerge : local.previewConfigurationMerge)(...args);
export const commitConfigurationMerge: typeof local.commitConfigurationMerge = (...args) => (selectedRuntime ? remote.commitConfigurationMerge : local.commitConfigurationMerge)(...args);
export const cancelConfigurationMerge: typeof local.cancelConfigurationMerge = (...args) => (selectedRuntime ? remote.cancelConfigurationMerge : local.cancelConfigurationMerge)(...args);
export const CONFIGURATION_MERGED: typeof local.CONFIGURATION_MERGED = selectedRuntime ? remote.CONFIGURATION_MERGED : local.CONFIGURATION_MERGED;
export const unlockMergeSourceCredentials: typeof local.unlockMergeSourceCredentials = (...args) => (selectedRuntime ? remote.unlockMergeSourceCredentials : local.unlockMergeSourceCredentials)(...args);
