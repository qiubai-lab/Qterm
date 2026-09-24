import type * as Desktop from "../../lib/tauri/settings";

export const getSettings: typeof Desktop.getSettings = async () => ({
  general: { rootDirectory: "/demo", defaultRootDirectory: "/demo", activeRootDirectory: "/demo", dataDirectory: "/demo/data", deviceDirectory: "/demo/device", cacheDirectory: "/demo/cache", restartRequired: false },
  security: { credentialAutoLockAfterSeconds: null, terminalAutoLockAfterSeconds: null },
  appearance: { theme: "cyberpunk" }, updates: { autoCheckOnStartup: false },
  terminal: { remoteShellIntegrationEnabled: true, historyFreeBashEnabled: false }, warning: null,
});
