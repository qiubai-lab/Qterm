import { dataLease, isControlRequest, pauseData } from "./dataAccess";
import { accessHeaders, accessProof } from "./accessIdentity";
export let API = "/api/v1";
/** Called once before the desktop remote workbench mounts. */
export function configureRuntimeApi(base: string) { API = base; }
export const AUTH_EXPIRED = "qterm-server-auth-expired";

export class RequestError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const lease = isControlRequest(path, init.method) ? undefined : dataLease();
  const signal = lease ? (init.signal ? AbortSignal.any([lease.signal, init.signal]) : lease.signal) : init.signal;
  const key = accessProof().accessKey;
  const headers = new Headers(init.headers);
  for (const [key,value] of Object.entries(accessHeaders())) headers.set(key,value);
  const response = await fetch(`${API}${path}`, { ...init, ...(signal ? {signal} : {}), headers, credentials: "same-origin", cache: "no-store" });
  lease?.check();
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { code?: string; message?: string } | null;
    if (response.status === 401 && key === accessProof().accessKey && path !== "/login" && !path.startsWith("/access/")) window.dispatchEvent(new CustomEvent(AUTH_EXPIRED,{detail:error?.code}));
    if (error?.code === "terminalLocked") pauseData();
    throw new RequestError(error?.code ?? "requestFailed", error?.message ?? "请求失败，请稍后重试", response.status);
  }
  return response;
}
export async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const lease = isControlRequest(path, method) ? undefined : dataLease();
  const response = await request(path, { method, signal, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const value = response.status === 204 ? undefined as T : await response.json() as T;
  lease?.check();
  return value;
}
export function message(error: unknown): string { return error instanceof Error ? error.message : "操作失败，请重试"; }
export function unsupported(): never { throw new Error("此功能暂不支持 Web 运行时"); }
