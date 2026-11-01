import type * as Desktop from "../../lib/tauri/notifications";
const key="qterm-web-notifications";
export const getNotificationSettings:typeof Desktop.getNotificationSettings=async()=>localStorage.getItem(key)==="true";
export const getNotificationBodySettings:typeof Desktop.getNotificationBodySettings=async()=>localStorage.getItem(`${key}-body`)==="true";
export const updateNotificationSettings:typeof Desktop.updateNotificationSettings=async enabled=>{if(enabled){if(!("Notification" in window)||await Notification.requestPermission()!=="granted")throw new Error("浏览器尚未允许通知");}localStorage.setItem(key,String(enabled));};
export const updateNotificationBodySettings:typeof Desktop.updateNotificationBodySettings=async enabled=>{localStorage.setItem(`${key}-body`,String(enabled));};
export const sendTerminalNotification:typeof Desktop.sendTerminalNotification=async(source,body)=>{if("Notification" in window&&Notification.permission==="granted")new Notification(source,{body});};
