import { accessHeaders, accessProof } from "./accessIdentity";
export const API = "/api/v1";
export const AUTH_EXPIRED = "qterm-server-auth-expired";

export class RequestError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const key = accessProof().accessKey;
  const headers = new Headers(init.headers);
  for (const [key,value] of Object.entries(accessHeaders())) headers.set(key,value);
  const response = await fetch(`${API}${path}`, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { code?: string; message?: string } | null;
    if (response.status === 401 && key === accessProof().accessKey && path !== "/login" && !path.startsWith("/access/")) window.dispatchEvent(new CustomEvent(AUTH_EXPIRED,{detail:error?.code}));
    throw new RequestError(error?.code ?? "requestFailed", error?.message ?? "请求失败，请稍后重试", response.status);
  }
  return response;
}
export async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await request(path, { method, signal, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export function message(error: unknown): string { return error instanceof Error ? error.message : "操作失败，请重试"; }
export function unsupported(): never { throw new Error("此功能暂不支持 Web 运行时"); }
