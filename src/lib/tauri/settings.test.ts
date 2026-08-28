import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { getSettings, selectConfigurationDirectory, updateAppearanceSettings, updateConfigurationDirectory, updateSecuritySettings, updateTerminalSettings, updateUpdateSettings } from "./settings";

describe("settings IPC client", () => {
  beforeEach(() => invoke.mockReset());

  it("loads the read-only storage layout and updates security settings", async () => {
    invoke.mockResolvedValue(undefined);
    await getSettings();
    expect(invoke).toHaveBeenCalledWith("settings_get");
    await updateSecuritySettings({ credentialAutoLockAfterSeconds: 900, terminalAutoLockAfterSeconds: 1800 });
    expect(invoke).toHaveBeenLastCalledWith("settings_update_security", {
      input: { credentialAutoLockAfterSeconds: 900, terminalAutoLockAfterSeconds: 1800 },
    });
    await updateConfigurationDirectory({ path: "D:\\Qterm" });
    expect(invoke).toHaveBeenLastCalledWith("settings_update_configuration_directory", {
      input: { path: "D:\\Qterm" },
    });
    await selectConfigurationDirectory("D:\\Qterm");
    expect(invoke).toHaveBeenLastCalledWith("settings_select_configuration_directory", {
      initialPath: "D:\\Qterm",
    });
    await updateAppearanceSettings({ theme: "light" });
    expect(invoke).toHaveBeenLastCalledWith("settings_update_appearance", { input: { theme: "light" } });
    await updateUpdateSettings({ autoCheckOnStartup: true });
    expect(invoke).toHaveBeenLastCalledWith("settings_update_updates", { input: { autoCheckOnStartup: true } });
    await updateTerminalSettings({ remoteShellIntegrationEnabled: false });
    expect(invoke).toHaveBeenLastCalledWith("settings_update_terminal", { input: { remoteShellIntegrationEnabled: false } });
    expect(invoke).toHaveBeenCalledTimes(7);
  });
});
