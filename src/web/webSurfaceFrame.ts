import type { WebFrame } from "../lib/tauri/web";

/** Resolve Chromium's computed sRGB forms without introducing a second theme palette. */
export function webFrameColor(value: string, opacity: number): WebFrame["color"] | null {
  const normalized = value.trim();
  // Computed custom properties retain authored hex tokens (unlike borderColor).
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(normalized)) {
    const hex = normalized.slice(1);
    const digits = hex.length <= 4 ? [...hex].map(char => char + char).join("") : hex;
    const channel = (start: number) => parseInt(digits.slice(start, start + 2), 16);
    return [channel(0), channel(2), channel(4), Math.round((digits.length === 8 ? channel(6) : 255) * Math.max(0, Math.min(1, opacity)))];
  }
  if (!/^(rgba?\(|color\(srgb\s)/.test(normalized)) return null;
  const parts = normalized.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?%?/gi);
  if (!parts || parts.length < 3) return null;
  const srgb = normalized.startsWith("color(");
  const channels = parts.slice(0, 3).map(part => Math.round(Math.max(0, Math.min(255, part.endsWith("%") ? parseFloat(part) * 255 / 100 : parseFloat(part) * (srgb ? 255 : 1)))));
  const alpha = parts[3] ? parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1) : 1;
  return [channels[0], channels[1], channels[2], Math.round(255 * Math.max(0, Math.min(1, alpha * opacity)))];
}

/** One viewport-space measurement shared by all native surfaces in a frame. */
export function measureWebSurfaceFrames(): WebFrame[] {
  const frames: WebFrame[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(".active-block-indicator")) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || element.closest("[inert]")) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const color = webFrameColor(style.borderTopColor, Number(style.opacity || 1));
    if (!color || color[3] === 0) continue;
    frames.push({
      x: rect.left, y: rect.top, width: rect.width, height: rect.height,
      radius: parseFloat(style.borderTopLeftRadius) || 0, stroke: parseFloat(style.borderTopWidth) || 1, color,
    });
  }
  return frames;
}

/** Mirror only the visible stroke into a transparent native overlay; never cut the guest. */
export function webSurfaceFrame(surface: DOMRect, frames = measureWebSurfaceFrames()): WebFrame | null {
  const frame = frames.find(edge => edge.x + edge.width > surface.left && edge.x < surface.right && edge.y + edge.height > surface.top && edge.y < surface.bottom);
  return frame ? { ...frame, x: frame.x - surface.left, y: frame.y - surface.top } : null;
}
