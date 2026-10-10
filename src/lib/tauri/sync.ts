import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface SyncSettings {
  enabled: boolean;
  serverUrl: string;
  allowInsecureHttp: boolean;
}
export interface SyncView extends SyncSettings {
  hasToken: boolean;
  status: {
    message: string;
    conflicts: { kind: "profile" | "group"; id: string; name: string }[];
    conflictToken: string | null;
    lastSuccess: number | null;
  };
}
export const getSync = (): Promise<SyncView> => invoke("sync_get");
export const configureSync = (input: SyncSettings & { token: string | null }): Promise<SyncView> =>
  invoke("sync_configure", { input });
export const runSync = (conflictToken: string | null = null, resolution: "local" | "remote" | null = null): Promise<SyncView> =>
  invoke("sync_run", { conflictToken, resolution });
export const onSyncProfilesChanged = (callback: () => void): Promise<() => void> =>
  listen("sync-profiles-changed", callback);
