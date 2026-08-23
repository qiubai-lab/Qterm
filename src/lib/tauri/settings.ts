import { invoke } from "@tauri-apps/api/core";

export interface SecuritySettings {
  credentialAutoLockAfterSeconds: number | null;
  terminalAutoLockAfterSeconds: number | null;
}

export type AppTheme = "dark" | "light" | "cyberpunk";

export interface AppearanceSettings {
  theme: AppTheme;
}

export interface UpdateSettings {
  autoCheckOnStartup: boolean;
}

export interface GeneralSettings {
  rootDirectory: string;
  activeRootDirectory: string;
  dataDirectory: string;
  deviceDirectory: string;
  cacheDirectory: string;
  restartRequired: boolean;
}

export interface SettingsSnapshot {
  general: GeneralSettings;
  security: SecuritySettings;
  appearance: AppearanceSettings;
  updates: UpdateSettings;
  warning: "corrupt" | "unsupportedVersion" | "storageUnavailable" | null;
}

export const getSettings = (): Promise<SettingsSnapshot> => invoke("settings_get");

export const selectConfigurationDirectory = (initialPath: string): Promise<string | null> =>
  invoke("settings_select_configuration_directory", { initialPath });

export const updateConfigurationDirectory = (input: { path: string }): Promise<SettingsSnapshot> =>
  invoke("settings_update_configuration_directory", { input });

export const updateSecuritySettings = (security: SecuritySettings): Promise<SettingsSnapshot> =>
  invoke("settings_update_security", { input: security });

export const updateAppearanceSettings = (appearance: AppearanceSettings): Promise<SettingsSnapshot> =>
  invoke("settings_update_appearance", { input: appearance });

export const updateUpdateSettings = (updates: UpdateSettings): Promise<SettingsSnapshot> =>
  invoke("settings_update_updates", { input: updates });
