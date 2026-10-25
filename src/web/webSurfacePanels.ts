import type { WebPanel } from "../lib/tauri/web";
import { webFrameColor } from "./webSurfaceFrame";

export const webNativePanelSelector = '[data-web-native-overlay="address-history"], [data-web-native-overlay="library"], [data-web-native-overlay="data-cleanup"], [data-web-native-overlay="tab-menu"], [data-web-native-overlay="host-summary"], [data-web-native-overlay="connection-picker"], [data-web-native-overlay="connection-group"]';

/** Shared reveal geometry for native holes and the antialiased rim above the guest. */
export function webHistoryPanel(element: HTMLElement, surface: DOMRect, style = getComputedStyle(element)): WebPanel | null {
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || element.closest("[inert]")) return null;
  // The moving drawer is clipped by its owner; its offscreen portion must never cut a neighbor.
  if (element.dataset.webNativeOverlay === "library") {
    const owner = element.closest(".web-browser-surface")?.getBoundingClientRect();
    if (!owner || (["left", "top", "width", "height"] as const).some(key => Math.abs(owner[key] - surface[key]) > 0.5)) return null;
  }
  const rect = element.getBoundingClientRect();
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

export function webSurfacePanels(surface: DOMRect): WebPanel[] {
  return [...document.querySelectorAll<HTMLElement>(webNativePanelSelector)]
    // Square drawers are fully exposed by their rectangular hole. Only rounded
    // panels need a native antialiased rim; rasterizing a drawer each frame is costly.
    .filter(element => !["library", "data-cleanup"].includes(element.dataset.webNativeOverlay ?? ""))
    .flatMap(element => {
      const style = getComputedStyle(element);
      const outer = webHistoryPanel(element, surface, style);
      if (!outer) return [];
      const color = webFrameColor(style.getPropertyValue("--web-native-overlay-stroke"), 1);
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
    }).slice(0, 8);
}
