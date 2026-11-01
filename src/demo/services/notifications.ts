import type * as Desktop from "../../lib/tauri/notifications";

let enabled = false;
let showBody = false;
export const getNotificationSettings: typeof Desktop.getNotificationSettings = async () => enabled;
export const updateNotificationSettings: typeof Desktop.updateNotificationSettings = async value => { enabled = value; };
export const getNotificationBodySettings: typeof Desktop.getNotificationBodySettings = async () => showBody;
export const updateNotificationBodySettings: typeof Desktop.updateNotificationBodySettings = async value => { showBody = value; };
/** Demo notifications remain in the workbench; never request system permission. */
export const sendTerminalNotification: typeof Desktop.sendTerminalNotification = async () => undefined;
