import type { WebFrame } from "../lib/tauri/web";

/** Resolve Chromium's computed sRGB forms without introducing a second theme palette. */
export function webFrameColor(value: string, opacity: number): WebFrame["color"] | null {
  const normalized = value.trim();
  if (!/^(rgba?\(|color\(srgb\s)/.test(normalized)) return null;
  const parts = normalized.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?%?/gi);
  if (!parts || parts.length < 3) return null;
  const srgb = normalized.startsWith("color(");
  const channels = parts.slice(0, 3).map(part => Math.round(Math.max(0, Math.min(255, part.endsWith("%") ? parseFloat(part) * 255 / 100 : parseFloat(part) * (srgb ? 255 : 1)))));
  const alpha = parts[3] ? parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1) : 1;
  return [channels[0], channels[1], channels[2], Math.round(255 * Math.max(0, Math.min(1, alpha * opacity)))];
}

/** Mirror only the visible stroke into a transparent native overlay; never cut the guest. */
export function webSurfaceFrame(surface: DOMRect): WebFrame | null {
  for (const element of document.querySelectorAll<HTMLElement>(".active-block-indicator")) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || element.closest("[inert]")) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= surface.left || rect.left >= surface.right || rect.bottom <= surface.top || rect.top >= surface.bottom) continue;
    const color = webFrameColor(style.borderTopColor, Number(style.opacity || 1));
    if (!color || color[3] === 0) continue;
    return {
      x: rect.left - surface.left, y: rect.top - surface.top, width: rect.width, height: rect.height,
      radius: parseFloat(style.borderTopLeftRadius) || 0, stroke: parseFloat(style.borderTopWidth) || 1, color,
    };
  }
  return null;
}
