import { afterEach, expect, it, vi } from "vitest";
import { webSurfaceOcclusions } from "./webSurfaceOcclusion";
import { webSurfacePanels } from "./webSurfacePanels";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([1, 1.25, 1.5, 2, 3, 4])("exposes the inset menu stroke throughout translation at %sx DPI", scale => {
  vi.stubGlobal("devicePixelRatio", scale);
  const surface = new DOMRect(30.3, 100.2, 600, 400);
  const menu = document.createElement("div"); menu.dataset.appOverlay = "floating";
  menu.style.cssText = "border:1px solid rgb(25,27,31);border-radius:7px;border-top-left-radius:7px;background:rgb(25,27,31);--app-overlay-stroke:rgba(0,221,235,.38)";
  document.body.append(menu);
  const measure = vi.spyOn(menu, "getBoundingClientRect");
  for (const offset of [-4, -2.5, -1, 0]) {
    // The menu crosses from the HTML header onto the native page, at a fractional origin.
    const rect = new DOMRect(80.65, 64.4 + offset, 151.5, 144);
    measure.mockReturnValue(rect);
    const cuts = webSurfaceOcclusions(surface).map(cut => ({
      left: Math.floor(cut.x * scale), right: Math.ceil((cut.x + cut.width) * scale),
      top: Math.floor(cut.y * scale), bottom: Math.ceil((cut.y + cut.height) * scale),
    }));
    const covered = (x: number, y: number) => cuts.some(cut => x >= cut.left && x < cut.right && y >= cut.top && y < cut.bottom);
    for (let y = Math.ceil(surface.top * scale); y < Math.floor((rect.bottom - 7) * scale); y++) {
      for (const x of [rect.left + 1.5, rect.right - 1.5]) {
        expect(covered(Math.floor((x - surface.left) * scale), Math.floor(y - surface.top * scale))).toBe(true);
      }
    }
    const pixel = (x: number, y: number) => covered(Math.floor((x - surface.left) * scale), Math.floor((y - surface.top) * scale));
    for (let x = rect.left + 7; x < rect.right - 7; x++) expect(pixel(x, rect.bottom - 1.5)).toBe(true);
    const diagonal = 5.5 / Math.sqrt(2);
    for (const x of [rect.left + 7 - diagonal, rect.right - 7 + diagonal]) {
      expect(pixel(x, rect.bottom - 7 + diagonal)).toBe(true);
    }
    const panels = webSurfacePanels(surface);
    expect(panels).toHaveLength(2);
    const [panel, stroke] = panels;
    expect(panel.edge.y).toBeCloseTo(rect.top - surface.top);
    expect(panel.edge.color).toEqual(panel.background);
    expect(panel.edge.color[3]).toBe(255);
    expect(stroke.edge).toEqual({ x: panel.edge.x + 1, y: panel.edge.y + 1,
      width: panel.edge.width - 2, height: panel.edge.height - 2, radius: 6,
      stroke: 1, color: [0, 221, 235, 97] });
    expect(stroke.background).toEqual(panel.background);
    // Page pixels away from the menu must stay untouched at every animation sample.
    expect(covered(400 * scale, 200 * scale)).toBe(false);
  }
  menu.remove();
  expect(webSurfaceOcclusions(surface)).toEqual([]);
  expect(webSurfacePanels(surface)).toEqual([]);
});
