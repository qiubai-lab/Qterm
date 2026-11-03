// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/browserProxy";
import * as remote from "../../server/services/browserProxy";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/browserProxy";
export const listProxyBrowsers: typeof local.listProxyBrowsers = (...args) => (selectedRuntime ? remote.listProxyBrowsers : local.listProxyBrowsers)(...args);
export const launchProxyBrowser: typeof local.launchProxyBrowser = (...args) => (selectedRuntime ? remote.launchProxyBrowser : local.launchProxyBrowser)(...args);
