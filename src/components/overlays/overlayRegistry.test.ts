import { afterEach, expect, it, vi } from "vitest";
import { measureAppOverlays, observeAppOverlays } from "./overlayRegistry";
import { webSurfaceOcclusions } from "../../web/webSurfaceOcclusion";
import { webSurfacePanels } from "../../web/webSurfacePanels";
import { surfaceNeedsCover } from "../../web/surface/nativeSurfaceCoordinator";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });
function panel(kind = "floating", top = 20) {
  const element = document.createElement("div"); element.dataset.appOverlay = kind;
  element.style.cssText = "border-top-left-radius:12px;background:rgb(25,27,31)";
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(20, top, 300, 150));
  document.body.append(element); return element;
}

it("registers any feature by contract and retains closing painted but inert/aria-hidden panels", () => {
  const element = panel(); element.inert = true; element.setAttribute("aria-hidden", "true");
  expect(measureAppOverlays()).toHaveLength(1);
  element.style.display = "none"; expect(measureAppOverlays()).toEqual([]);
  element.style.display = "block"; element.style.opacity = "0";
  expect(measureAppOverlays()).toEqual([]);
});

it("tracks new and removed portals without rescanning the document on every frame", async () => {
  const registry = observeAppOverlays();
  const element = panel(); await Promise.resolve();
  const query = vi.spyOn(document, "querySelectorAll");
  expect(registry.measure()).toHaveLength(1); expect(registry.measure()).toHaveLength(1);
  expect(query).not.toHaveBeenCalled();
  element.remove(); await Promise.resolve(); expect(registry.measure()).toEqual([]);
  registry.dispose();
});

it("preserves every cutout and selects complete coverage rather than silently truncating the IPC budget", () => {
  for (const top of [20, 220, 420]) panel("floating", top);
  const rect = new DOMRect(0, 0, 800, 800), overlays = measureAppOverlays();
  const cuts = webSurfaceOcclusions(rect, overlays), rims = webSurfacePanels(rect, overlays);
  expect(cuts).toHaveLength(75);
  expect(surfaceNeedsCover(rect, overlays, cuts.length, rims.length)).toBe(true);
  expect(surfaceNeedsCover(rect, overlays, 25, 2)).toBe(false);
});

it("covers only surfaces intersecting a modal and keeps nested coverage until the last modal leaves", () => {
  const first = panel("modal"), second = panel("modal", 50);
  const rect = new DOMRect(0, 0, 800, 800);
  expect(surfaceNeedsCover(new DOMRect(900, 0, 400, 400), measureAppOverlays(), 0, 0)).toBe(false);
  expect(surfaceNeedsCover(rect, measureAppOverlays(), 0, 0)).toBe(true);
  second.remove(); expect(surfaceNeedsCover(rect, measureAppOverlays(), 0, 0)).toBe(true);
  first.remove(); expect(surfaceNeedsCover(rect, measureAppOverlays(), 0, 0)).toBe(false);
});
