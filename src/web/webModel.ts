import { nativeWebSupported } from "../lib/tauri/webCapabilities";

export function supportsWebBlocks(profileId?: string | null) {
  return nativeWebSupported(profileId != null);
}

export function webSupportNotice(profileId?: string | null) {
  return profileId != null && nativeWebSupported() && !nativeWebSupported(true)
    ? "当前 WebKit 无法启用隧道网络保护，请使用外部代理浏览器"
    : "内部浏览器需要 Windows 或 macOS 14 及以上桌面版";
}

export function normalizeWebAddress(value: string): string {
  const text = value.trim();
  if (!text || text.length > 8192 || Array.from(text).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error("请输入有效的网页地址");
  let url: URL;
  try { url = new URL(text.includes("://") ? text : `http://${text}`); } catch { throw new Error("请输入有效的网页地址"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || /\.localhost\.?$/i.test(url.hostname)) throw new Error("仅支持不含用户名或密码的 HTTP/HTTPS 地址");
  return url.href;
}

export function webSurfaceVisible(element: HTMLElement, visible: boolean): boolean {
  // Visibility belongs to the guest lifecycle. Overlays have a separate paint
  // and input plan; ARIA roles must never hide unrelated native windows.
  return visible && !document.hidden && !element.closest('[inert], [aria-hidden="true"]')
    && !document.querySelector('.terminal-lock-screen');
}
