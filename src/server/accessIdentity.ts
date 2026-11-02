import { randomId } from "../lib/randomId";
/** Cookie authenticates the browser; this separate proof binds access to one page. */
const STORAGE_KEY = "qterm:access-key";
const clientId = randomId();
let accessKey = "";
try { accessKey = sessionStorage.getItem(STORAGE_KEY) ?? ""; } catch { /* Login still works without storage. */ }
export function accessProof() { return {clientId, accessKey}; }
export function rememberAccess(key: string) {
  accessKey = key;
  try { if (key) sessionStorage.setItem(STORAGE_KEY, key); else sessionStorage.removeItem(STORAGE_KEY); } catch { /* Refresh requires login if storage is disabled. */ }
}
export function accessHeaders() { return {"X-Qterm-Client": clientId, "X-Qterm-Access": accessKey}; }
