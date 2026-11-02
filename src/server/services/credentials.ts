import { dataLease, dataPaused, subscribeDataAccess } from "../dataAccess";
import type * as Desktop from "../../lib/tauri/credentials";
import { api, request } from "../http";
import { saveBrowserResponse, selectBrowserFile } from "../browserFiles";
import { createVaultStatusObserver } from "./vaultStatusObserver";
export type * from "../../lib/tauri/credentials";
let recoveryId: string | undefined;
let resetId: string | undefined;
export const getVaultStatus: typeof Desktop.getVaultStatus = () => api("/vault");
const vaultStatus = createVaultStatusObserver(getVaultStatus, {paused: dataPaused, subscribe: subscribeDataAccess});
async function mutate<T>(path:string,method:string,body?:unknown):Promise<T> {const value=await api<T>(path,method,body);await vaultStatus.refreshAfterMutation();return value;}
export const onVaultStatusChanged: typeof Desktop.onVaultStatusChanged = async listener => vaultStatus.subscribe(listener);
export async function downloadVaultRecovery():Promise<void> {
  const {id}=await api<{id:string}>("/vault/recovery","POST"); recoveryId=id;
  await saveBrowserResponse(await request(`/vault/recovery/${id}`),"qterm-recovery.key");
}
export const initializeVault: typeof Desktop.initializeVault = async masterPassword => {
  if (!recoveryId) throw new Error("请先下载并保存恢复密钥");
  const result=await mutate<Desktop.FileOperationResult>("/vault/initialize","POST",{masterPassword,recoveryId,savedRecovery:true});recoveryId=undefined;return result;
};
export const unlockVault: typeof Desktop.unlockVault = masterPassword => mutate("/vault/unlock","POST",{masterPassword});
export const lockVault: typeof Desktop.lockVault = () => mutate("/vault/lock","POST");
export const changeMasterPassword: typeof Desktop.changeMasterPassword = (oldPassword,newPassword) => mutate("/vault/password","PUT",{oldPassword,newPassword});
export const clearVault: typeof Desktop.clearVault = confirmation => mutate("/vault/clear","POST",{confirmation});
export const listCredentials: typeof Desktop.listCredentials = () => api("/credentials");
export const createPasswordCredential: typeof Desktop.createPasswordCredential = (name,password) => api("/credentials","POST",{name,password});
export const renameCredential: typeof Desktop.renameCredential = (id,name) => api(`/credentials/${encodeURIComponent(id)}`,"PUT",{name});
export const deleteCredential: typeof Desktop.deleteCredential = id => api(`/credentials/${encodeURIComponent(id)}`,"DELETE");
export const getCredentialPublicKey: typeof Desktop.getCredentialPublicKey = id => api(`/credentials/${encodeURIComponent(id)}/public-key`);
export const revealCredentialPassword: typeof Desktop.revealCredentialPassword = id => api(`/credentials/${encodeURIComponent(id)}/password`,"POST");
export const prepareGeneratedPrivateKeyCredential: typeof Desktop.prepareGeneratedPrivateKeyCredential = (algorithm,comment) => api("/credentials/drafts/generate","POST",{algorithm,comment});
export const preparePrivateKeyCredential: typeof Desktop.preparePrivateKeyCredential = async () => {
  const file=await selectBrowserFile(); if(!file) return null;
  if(file.size>1024*1024)throw new Error("私钥文件不能超过 1 MiB");
  return api("/credentials/drafts/import","POST",{name:file.name,content:await file.text()});
};
export const prepareDroppedPrivateKeyCredential: typeof Desktop.prepareDroppedPrivateKeyCredential = async () => {throw new Error("请点击选择私钥文件");};
export const commitPrivateKeyCredential: typeof Desktop.commitPrivateKeyCredential = (id,name,passphrase) => api(`/credentials/drafts/${encodeURIComponent(id)}`,"POST",{name,passphrase});
export const cancelPrivateKeyCredential: typeof Desktop.cancelPrivateKeyCredential = id => api(`/credentials/drafts/${encodeURIComponent(id)}`,"DELETE");
export const prepareMasterPasswordReset: typeof Desktop.prepareMasterPasswordReset = async () => {
  const file=await selectBrowserFile();if(!file)return {completed:false};if(file.size>1024*1024)throw new Error("恢复文件过大");
  const lease=dataLease();
  const response=await request("/vault/reset/prepare",{method:"POST",body:file});const value=await response.json() as {id:string};lease.check();resetId=value.id;return {completed:true};
};
export async function downloadResetRecovery():Promise<void>{if(!resetId)throw new Error("请重新选择恢复文件");await saveBrowserResponse(await request(`/vault/recovery/${resetId}`),"qterm-recovery.key");}
export const resetMasterPassword: typeof Desktop.resetMasterPassword = async newPassword => {if(!resetId)throw new Error("请重新选择恢复文件");const result=await mutate<Desktop.FileOperationResult>("/vault/reset","POST",{masterPassword:newPassword,recoveryId:resetId,savedRecovery:true});resetId=undefined;return result;};
export const cancelMasterPasswordReset: typeof Desktop.cancelMasterPasswordReset = async () => {resetId=undefined;await api("/vault/reset","DELETE");};
