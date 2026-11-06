// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/transfers";
import * as remote from "../../server/services/transfers";
import { selectedRuntime } from "../selection";
import { uploadRemoteDrop } from "../droppedUpload";
export type * from "../../lib/tauri/transfers";
export const selectUploadFile: typeof local.selectUploadFile = (...args) => (selectedRuntime ? remote.selectUploadFile : local.selectUploadFile)(...args);
export const selectUploadFiles: typeof local.selectUploadFiles = (...args) => (selectedRuntime ? remote.selectUploadFiles : local.selectUploadFiles)(...args);
export const selectUploadFolder: typeof local.selectUploadFolder = (...args) => (selectedRuntime ? remote.selectUploadFolder : local.selectUploadFolder)(...args);
export const selectDownloadPath: typeof local.selectDownloadPath = (...args) => (selectedRuntime ? remote.selectDownloadPath : local.selectDownloadPath)(...args);
export const selectDownloadDirectory: typeof local.selectDownloadDirectory = (...args) => (selectedRuntime ? remote.selectDownloadDirectory : local.selectDownloadDirectory)(...args);
export const uploadFile: typeof local.uploadFile = (...args) => (selectedRuntime ? remote.uploadFile : local.uploadFile)(...args);
export const downloadFile: typeof local.downloadFile = (...args) => (selectedRuntime ? remote.downloadFile : local.downloadFile)(...args);
export const uploadDroppedEntries: typeof local.uploadDroppedEntries = (...args) => (selectedRuntime ? uploadRemoteDrop : local.uploadDroppedEntries)(...args);
export const uploadSelectedEntries: typeof local.uploadSelectedEntries = (...args) => (selectedRuntime ? remote.uploadSelectedEntries : local.uploadSelectedEntries)(...args);
export const downloadDirectory: typeof local.downloadDirectory = (...args) => (selectedRuntime ? remote.downloadDirectory : local.downloadDirectory)(...args);
export const cancelTransfer: typeof local.cancelTransfer = (...args) => (selectedRuntime ? remote.cancelTransfer : local.cancelTransfer)(...args);
