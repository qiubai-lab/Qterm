import type * as Desktop from "../../lib/tauri/browserProxy";
import { unsupported } from "../http";
export type * from "../../lib/tauri/browserProxy";
export const listProxyBrowsers: typeof Desktop.listProxyBrowsers = async () => [];
export const launchProxyBrowser: typeof Desktop.launchProxyBrowser = async () => unsupported();
