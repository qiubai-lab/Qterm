import { assertRuntimeAttached } from "../switchGuard";
// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/files";
import * as remote from "../../server/services/files";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/files";
export const listLocalDirectory: typeof local.listLocalDirectory = (...args) => (selectedRuntime ? remote.listLocalDirectory : local.listLocalDirectory)(...args);
export const listLocalRoots: typeof local.listLocalRoots = (...args) => (selectedRuntime ? remote.listLocalRoots : local.listLocalRoots)(...args);
export const listRemoteDirectory: typeof local.listRemoteDirectory = (...args) => (selectedRuntime ? remote.listRemoteDirectory : local.listRemoteDirectory)(...args);
export const readTextFile: typeof local.readTextFile = (...args) => (selectedRuntime ? remote.readTextFile : local.readTextFile)(...args);
export const readBinaryFile: typeof local.readBinaryFile = (...args) => (selectedRuntime ? remote.readBinaryFile : local.readBinaryFile)(...args);
export const writeTextFile: typeof local.writeTextFile = (...args) => (selectedRuntime ? remote.writeTextFile : local.writeTextFile)(...args);
export const copyFile: typeof local.copyFile = (...args) => (selectedRuntime ? remote.copyFile : local.copyFile)(...args);
export const createEntry: typeof local.createEntry = (...args) => (selectedRuntime ? remote.createEntry : local.createEntry)(...args);
export const renameEntry: typeof local.renameEntry = (...args) => (selectedRuntime ? remote.renameEntry : local.renameEntry)(...args);
export const deleteEntry: typeof local.deleteEntry = (...args) => (selectedRuntime ? remote.deleteEntry : local.deleteEntry)(...args);
export const connectFileSession: typeof local.connectFileSession = (...args) => { assertRuntimeAttached(); return (selectedRuntime ? remote.connectFileSession : local.connectFileSession)(...args) };
