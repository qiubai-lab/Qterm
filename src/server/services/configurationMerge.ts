import { unsupported } from "../http";
export type * from "../../lib/tauri/configurationMerge";
export const CONFIGURATION_MERGED = "qterm:configuration-merged";
export const selectMergeSource = async () => unsupported();
export const previewConfigurationMerge = async () => unsupported();
export const commitConfigurationMerge = async () => unsupported();
export const cancelConfigurationMerge = async () => undefined;
export const unlockMergeSourceCredentials = async () => unsupported();
