import type { WebPanel } from "../lib/tauri/web";
import { webFrameColor } from "./webSurfaceFrame";

export const webNativePanelSelector = '[data-web-native-overlay="address-history"], [data-web-native-overlay="library"], [data-web-native-overlay="data-cleanup"]';

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
    .filter(element => element.dataset.webNativeOverlay === "address-history")
    .map(element => webHistoryPanel(element, surface)).filter((panel): panel is WebPanel => panel !== null).slice(0, 8);
}
