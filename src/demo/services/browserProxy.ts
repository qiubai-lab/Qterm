import type * as Desktop from "../../lib/tauri/browserProxy";
export type * from "../../lib/tauri/browserProxy";
export const listProxyBrowsers: typeof Desktop.listProxyBrowsers = async () => [];
export const launchProxyBrowser: typeof Desktop.launchProxyBrowser = async () => { throw new Error("演示环境不会启动代理浏览器，也没有建立真实隧道。"); };
