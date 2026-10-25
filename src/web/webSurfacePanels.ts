import type { WebPanel } from "../lib/tauri/web";
import { webFrameColor } from "./webSurfaceFrame";
import { measureAppOverlays, type AppOverlay } from "../components/overlays/overlayRegistry";

/** Shared reveal geometry for native holes and the antialiased rim above the guest. */
export function webHistoryPanel(element: HTMLElement, surface: DOMRect, style = getComputedStyle(element), measured = element.getBoundingClientRect(), clip: DOMRect | null = null): WebPanel | null {
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return null;
  const rect = clip ? new DOMRect(Math.max(measured.left, clip.left), Math.max(measured.top, clip.top),
    Math.max(0, Math.min(measured.right, clip.right) - Math.max(measured.left, clip.left)),
    Math.max(0, Math.min(measured.bottom, clip.bottom) - Math.max(measured.top, clip.top))) : measured;
  const inset = /inset\(\S+\s+\S+\s+([\d.]+)(%|px)/.exec(style.clipPath);
  const hidden = inset ? Number(inset[1]) * (inset[2] === "%" ? rect.height / 100 : 1) : 0;
  const height = Math.max(0, rect.height - hidden);
  if (rect.width <= 0 || height <= 0 || rect.right <= surface.left || rect.left >= surface.right || rect.top + height <= surface.top || rect.top >= surface.bottom) return null;
  return {
    edge: { x: rect.left - surface.left, y: rect.top - surface.top, width: rect.width, height,
      radius: Math.min(parseFloat(style.borderTopLeftRadius || style.borderRadius) || 0, rect.width / 2, height / 2),
      stroke: parseFloat(style.borderTopWidth) || 1, color: webFrameColor(style.borderTopColor, 1) ?? [0, 0, 0, 0] },
    background: webFrameColor(style.backgroundColor, 1) ?? [0, 0, 0, 0],
  };
}

export function webSurfacePanels(surface: DOMRect, overlays = measureAppOverlays()): WebPanel[] {
  return overlays.filter(overlay => overlay.kind === "floating")
    .flatMap(({ element, style, rect, clip }: AppOverlay) => {
      const outer = webHistoryPanel(element, surface, style, rect, clip);
      if (!outer || !outer.edge.radius) return [];
      const color = webFrameColor(style.getPropertyValue("--app-overlay-stroke"), 1);
      if (!color) return [outer];
      const inset = parseFloat(style.borderTopWidth) || 1;
      if (outer.edge.width <= inset * 2 || outer.edge.height <= inset * 2) return [outer];
      // Conservative HWND holes leave corner pixels to the native rim. Mirror
      // the CSS inset shadow there too, above the opaque outer background.
      const inner: WebPanel = { background: outer.background, edge: { ...outer.edge,
        x: outer.edge.x + inset, y: outer.edge.y + inset,
        width: outer.edge.width - inset * 2, height: outer.edge.height - inset * 2,
        radius: Math.max(0, outer.edge.radius - inset), stroke: 1, color } };
      return [outer, inner];
    });
}
