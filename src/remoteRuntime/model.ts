import { randomId } from "../lib/randomId";
export interface ServerEntry { id: string; name: string; endpoint: string }
export function normalizeEndpoint(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("请输入完整的 HTTP 或 HTTPS 地址"); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error("地址只允许协议、主机和端口，不含账号、路径或参数");
  }
  return url.origin;
}
export function serverEntry(name: string, endpoint: string, id: string = randomId()): ServerEntry {
  const address = normalizeEndpoint(endpoint);
  return { id, name: name.trim().slice(0, 80) || new URL(address).host, endpoint: address };
}
