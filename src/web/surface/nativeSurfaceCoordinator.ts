import { observeAppOverlays, overlaps, type AppOverlay } from "../../components/overlays/overlayRegistry";
import { webSurfaceVisible } from "../webModel";
import { webSurfaceOcclusions } from "../webSurfaceOcclusion";
import { webSurfacePanels } from "../webSurfacePanels";
import { measureWebSurfaceFrames, webSurfaceFrame } from "../webSurfaceFrame";
import { webScrollbarTheme } from "../webScrollbarTheme";
import { createSurfaceSync } from "./surfaceSync";

interface Surface {
  id: string; element: HTMLElement; visible: () => boolean; revision: () => number;
  url: () => string; snapshotReady: () => boolean; onError: (reason: string) => void;
}
const surfaces = new Map<Surface, ReturnType<typeof createSurfaceSync>>();
let frame = 0;
let registry: ReturnType<typeof observeAppOverlays> | null = null;

export function surfaceNeedsCover(rect: DOMRect, overlays: AppOverlay[], regions: number, panels: number) {
  return regions > 64 || panels > 8 || overlays.some(overlay => overlay.kind !== "floating" && overlaps(rect, overlay.rect));
}

function update() {
  frame = requestAnimationFrame(update);
  const overlays = registry?.measure() ?? [];
  const frames = measureWebSurfaceFrames();
  const scrollbar = webScrollbarTheme();
  for (const [surface, sync] of surfaces) {
    if (!surface.visible() || document.hidden) {
      sync.update({ cover: false, revision: surface.revision(), url: surface.url(),
        bounds: { x: 0, y: 0, width: 1, height: 1, visible: false } });
      continue;
    }
    const rect = surface.element.getBoundingClientRect();
    const visible = rect.width > 1 && rect.height > 1 && webSurfaceVisible(surface.element, surface.visible());
    const occlusions = visible ? webSurfaceOcclusions(rect, overlays) : [];
    const panels = visible ? webSurfacePanels(rect, overlays) : [];
    const cover = visible && surfaceNeedsCover(rect, overlays, occlusions.length, panels.length);
    sync.update({ cover, revision: surface.revision(), url: surface.url(), snapshotReady: surface.snapshotReady(), bounds: {
      x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.max(1, rect.width), height: Math.max(1, rect.height), visible,
      occlusions: occlusions.length > 64 ? [] : occlusions, panels: panels.length > 8 ? [] : panels,
      frame: visible ? webSurfaceFrame(rect, frames) : null, scrollbar,
    } });
  }
}

export function registerNativeSurface(surface: Surface) {
  const sync = createSurfaceSync(surface.id, surface.element, surface.onError);
  surfaces.set(surface, sync);
  if (!registry) { registry = observeAppOverlays(); update(); }
  return () => {
    surfaces.delete(surface); sync.dispose();
    if (!surfaces.size) { cancelAnimationFrame(frame); frame = 0; registry?.dispose(); registry = null; }
  };
}
