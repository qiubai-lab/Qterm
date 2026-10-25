import { isDemo } from "../lib/runtime/environment";

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
  // A listbox describes selection semantics, not a modal that should hide native content.
  // Blocking list pickers already live inside dialogs; address suggestions use local clipping.
  return visible && !document.hidden && !element.closest('[inert], [aria-hidden="true"]')
    && !document.querySelector('[role="dialog"]:not([data-web-native-overlay="library"]):not([data-web-native-overlay="data-cleanup"]), [role="menu"], .dialog-backdrop, .terminal-lock-screen, .drag-ghost');
}
