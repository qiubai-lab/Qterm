import { assertRuntimeAttached } from "../switchGuard";
// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/network";
import * as remote from "../../server/services/network";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/network";
export const listNetworkRules: typeof local.listNetworkRules = (...args) => (selectedRuntime ? remote.listNetworkRules : local.listNetworkRules)(...args);
export const createNetworkRule: typeof local.createNetworkRule = (...args) => (selectedRuntime ? remote.createNetworkRule : local.createNetworkRule)(...args);
export const updateNetworkRule: typeof local.updateNetworkRule = (...args) => (selectedRuntime ? remote.updateNetworkRule : local.updateNetworkRule)(...args);
export const deleteNetworkRule: typeof local.deleteNetworkRule = (...args) => (selectedRuntime ? remote.deleteNetworkRule : local.deleteNetworkRule)(...args);
export const connectNetworkSession: typeof local.connectNetworkSession = (...args) => { assertRuntimeAttached(); return (selectedRuntime ? remote.connectNetworkSession : local.connectNetworkSession)(...args) };
export const startNetworkRule: typeof local.startNetworkRule = (...args) => (selectedRuntime ? remote.startNetworkRule : local.startNetworkRule)(...args);
export const stopNetworkRule: typeof local.stopNetworkRule = (...args) => (selectedRuntime ? remote.stopNetworkRule : local.stopNetworkRule)(...args);
