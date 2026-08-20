import { invoke } from "@tauri-apps/api/core";

export interface SecuritySettings {
  credentialAutoLockAfterSeconds: number | null;
  terminalAutoLockAfterSeconds: number | null;
}

export interface GeneralSettings {
  dataDirectory: string;
  activeDataDirectory: string;
  restartRequired: boolean;
}

export interface DataDirectorySettings {
  path: string;
}

export interface SettingsSnapshot {
  general: GeneralSettings;
  security: SecuritySettings;
  warning: "corrupt" | "unsupportedVersion" | "storageUnavailable" | null;
}

export const getSettings = (): Promise<SettingsSnapshot> => invoke("settings_get");

export const updateSecuritySettings = (security: SecuritySettings): Promise<SettingsSnapshot> =>
  invoke("settings_update_security", { input: security });

export const updateDataDirectory = (input: DataDirectorySettings): Promise<SettingsSnapshot> =>
  invoke("settings_update_data_directory", { input });

export const selectDataDirectory = (initialPath?: string): Promise<string | null> =>
  invoke("settings_select_data_directory", { initialPath });
