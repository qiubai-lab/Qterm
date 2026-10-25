import { webHistoryPanel } from "./webSurfacePanels";
import type { WebClipRect } from "../lib/tauri/web";
import { measureAppOverlays } from "../components/overlays/overlayRegistry";

/** Native child windows sit above CSS. Cut out only overlapping app chrome. */
export function webSurfaceOcclusions(surface: DOMRect, overlays = measureAppOverlays()): WebClipRect[] {
  const result: WebClipRect[] = [];
  function add(left: number, top: number, right: number, bottom: number) {
    const x = Math.max(left, surface.left), y = Math.max(top, surface.top);
    const width = Math.min(right, surface.right) - x, height = Math.min(bottom, surface.bottom) - y;
    if (width > 0 && height > 0) result.push({ x: x - surface.left, y: y - surface.top, width, height });
  }
  for (const { element, kind, style, rect, clip } of overlays) {
    if (kind !== "floating") continue;
    const panel = webHistoryPanel(element, surface, style, rect, clip);
    if (!panel) continue;
    const { height, radius } = panel.edge;
    const left = surface.left + panel.edge.x, top = surface.top + panel.edge.y;
    if (!radius) { add(left, top, left + panel.edge.width, top + height); continue; }
    addRounded(left, top, left + panel.edge.width, top + height, radius);

  }
  // The coordinator handles an exceeded IPC budget with a complete cover.
  // Silently dropping the tail leaves native content above later menu items.
  return result;

  function addRounded(left: number, top: number, right: number, bottom: number, radius: number) {
    const scale = window.devicePixelRatio || 1;
    // At most 25 rectangles per history panel, within the existing 64-region IPC budget.
    const step = Math.ceil(radius * scale / 12);
    const y1 = Math.ceil((Math.max(top, surface.top) - surface.top) * scale);
    const y2 = Math.floor((Math.min(bottom, surface.bottom) - surface.top) * scale);
    if (y2 <= y1) return;
    const cuts = new Set([y1, y2]);
    for (let offset = step; offset < radius * scale + step; offset += step) {
      cuts.add(Math.min(y2, y1 + offset));
      cuts.add(Math.max(y1, y2 - offset));
    }
    const rows = [...cuts].sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i++) {
      const t = rows[i - 1], b = rows[i];
      const distance = Math.max(0, Math.min(radius, surface.top + t / scale - top, bottom - surface.top - b / scale));
      const inset = radius - Math.sqrt(radius * radius - (radius - distance) ** 2);
      const x1 = Math.ceil((Math.max(left + inset, surface.left) - surface.left) * scale);
      const x2 = Math.floor((Math.min(right - inset, surface.right) - surface.left) * scale);
      // Stay inside opaque pixels, including at fractional DPI. Epsilon prevents the
      // backend's outward rounding from expanding a floating-point integer by a pixel.
      if (x2 > x1 && b > t) result.push({ x: (x1 + 1e-6) / scale, y: (t + 1e-6) / scale,
        width: (x2 - x1 - 2e-6) / scale, height: (b - t - 2e-6) / scale });
    }
  }
}
