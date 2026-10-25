import { isDemo } from "../lib/runtime/environment";
import { webNativePanelSelector } from "./webSurfacePanels";

export function supportsWebBlocks() {
  return !isDemo && /Windows/i.test(navigator.userAgent) && "__TAURI_INTERNALS__" in window;
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
  // Local overlays must use the same registry as native clipping. Treating their
  // menu/dialog roles as global blockers hides the entire WebView behind them.
  const blockingOverlay = [...document.querySelectorAll('[role="dialog"], [role="menu"]')]
    .some(overlay => !overlay.matches(webNativePanelSelector));
  return visible && !document.hidden && !element.closest('[inert], [aria-hidden="true"]')
    && !blockingOverlay && !document.querySelector('.dialog-backdrop, .terminal-lock-screen, .drag-ghost');
}
