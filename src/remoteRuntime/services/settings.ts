// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/settings";
import * as remote from "../../server/services/settings";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/settings";
export const getSettings: typeof local.getSettings = (...args) => (selectedRuntime ? remote.getSettings : local.getSettings)(...args);
export const selectConfigurationDirectory: typeof local.selectConfigurationDirectory = (...args) => (selectedRuntime ? remote.selectConfigurationDirectory : local.selectConfigurationDirectory)(...args);
export const updateConfigurationDirectory: typeof local.updateConfigurationDirectory = (...args) => (selectedRuntime ? remote.updateConfigurationDirectory : local.updateConfigurationDirectory)(...args);
export const updateSecuritySettings: typeof local.updateSecuritySettings = (...args) => (selectedRuntime ? remote.updateSecuritySettings : local.updateSecuritySettings)(...args);
export const updateAppearanceSettings: typeof local.updateAppearanceSettings = (...args) => (selectedRuntime ? remote.updateAppearanceSettings : local.updateAppearanceSettings)(...args);
export const updateUpdateSettings: typeof local.updateUpdateSettings = (...args) => (selectedRuntime ? remote.updateUpdateSettings : local.updateUpdateSettings)(...args);
export const updateTerminalSettings: typeof local.updateTerminalSettings = (...args) => (selectedRuntime ? remote.updateTerminalSettings : local.updateTerminalSettings)(...args);
