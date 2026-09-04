import { invoke } from "@tauri-apps/api/core";
export const getNotificationSettings = (): Promise<boolean> => invoke("notification_settings_get");
export const updateNotificationSettings = (enabled: boolean): Promise<void> => invoke("notification_settings_update", { enabled });
export const sendTerminalNotification = (source: string, body: string): Promise<void> => invoke("terminal_notification_send", { source, body });

export const getNotificationBodySettings = (): Promise<boolean> => invoke("notification_body_settings_get");
export const updateNotificationBodySettings = (enabled: boolean): Promise<void> => invoke("notification_body_settings_update", { enabled });
