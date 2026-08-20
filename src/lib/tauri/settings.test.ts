import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { getSettings, selectDataDirectory, updateDataDirectory, updateSecuritySettings } from "./settings";

describe("settings IPC client", () => {
  beforeEach(() => invoke.mockReset());

  it("loads and updates the general and security settings DTOs", async () => {
    invoke.mockResolvedValue(undefined);
    await getSettings();
    expect(invoke).toHaveBeenCalledWith("settings_get");
    await updateSecuritySettings({ credentialAutoLockAfterSeconds: 900, terminalAutoLockAfterSeconds: 1800 });
    expect(invoke).toHaveBeenLastCalledWith("settings_update_security", {
      input: { credentialAutoLockAfterSeconds: 900, terminalAutoLockAfterSeconds: 1800 },
    });
    await updateDataDirectory({ path: "D:\\Qterm Data" });
    expect(invoke).toHaveBeenLastCalledWith("settings_update_data_directory", {
      input: { path: "D:\\Qterm Data" },
    });
    await selectDataDirectory("D:\\Qterm Data");
    expect(invoke).toHaveBeenLastCalledWith("settings_select_data_directory", {
      initialPath: "D:\\Qterm Data",
    });
  });
});
