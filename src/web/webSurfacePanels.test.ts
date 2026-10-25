import { afterEach, expect, it, vi } from "vitest";
import { webHistoryPanel, webSurfacePanels } from "./webSurfacePanels";
import { webSurfaceOcclusions } from "./webSurfaceOcclusion";
import { webSurfaceVisible } from "./webModel";
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });
it.each(["address-history", "library", "data-cleanup", "tab-menu"])("uses local clipping rather than global hiding for registered %s overlays", kind => {
  const surface = document.createElement("div"), overlay = document.createElement("div");
  overlay.dataset.appOverlay = "floating"; overlay.dataset.testKind = kind; document.body.append(surface, overlay);
  for (const role of ["menu", "dialog"]) {
    overlay.setAttribute("role", role);
    expect(webSurfaceVisible(surface, true)).toBe(true);
  }
  delete overlay.dataset.appOverlay;
  expect(webSurfaceVisible(surface, true)).toBe(true);
});
it("keeps native pages visible beneath browser tab menus and clips only overlapping menu geometry", () => {
  const surface = document.createElement("div"), menu = document.createElement("div");
  menu.setAttribute("role", "menu"); menu.dataset.appOverlay = "floating";
  menu.style.cssText = "border-top-left-radius: 7px; background: rgb(25,27,31)"; document.body.append(surface, menu);
  vi.spyOn(menu, "getBoundingClientRect").mockReturnValue(new DOMRect(50, 30, 170, 150));
  const rect = new DOMRect(10, 10, 600, 400);
  expect(webSurfaceVisible(surface, true)).toBe(true);
  expect(webSurfaceOcclusions(rect).length).toBeGreaterThan(0);
  expect(webSurfacePanels(rect)).toHaveLength(1);
  expect(webSurfaceOcclusions(new DOMRect(700, 10, 600, 400))).toEqual([]);
  delete menu.dataset.appOverlay; expect(webSurfaceVisible(surface, true)).toBe(true);
});
it("mirrors the rounded cleanup card rim while keeping its native page visible", () => {
  const popover = document.createElement("div"); popover.dataset.appOverlay = "floating";
  popover.setAttribute("role", "dialog");
  popover.style.cssText = "background: rgb(25,27,31); border: 1px solid rgb(25,27,31); border-radius: 9px; border-top-left-radius: 9px; --app-overlay-stroke: #00bbcc"; document.body.append(popover);
  vi.spyOn(popover, "getBoundingClientRect").mockReturnValue(new DOMRect(50, 30, 250, 280));
  const surface = new DOMRect(10, 10, 600, 400);
  expect(webSurfaceOcclusions(surface).length).toBeGreaterThan(1);
  expect(webSurfacePanels(surface)).toMatchObject([
    { edge: { x: 40, y: 20, width: 250, height: 280, radius: 9 } },
    { edge: { x: 41, y: 21, width: 248, height: 278, radius: 8, color: [0, 187, 204, 255] } },
  ]);
  expect(webSurfaceVisible(document.body, true)).toBe(true);
});
it("clips only the owning guest while the drawer slides right and retains nested modal behavior", () => {
  const owner = document.createElement("div");
  owner.className = "web-browser-surface";
  const drawer = document.createElement("section");
  drawer.dataset.appOverlay = "floating"; drawer.dataset.overlayClip = "parent";
  drawer.setAttribute("role", "dialog");
  drawer.style.cssText = "border-radius: 0px; background: rgb(25,27,31); border: 1px solid rgb(48,52,58)";
  owner.append(drawer); document.body.append(owner);
  const surface = new DOMRect(10, 10, 600, 400);
  vi.spyOn(owner, "getBoundingClientRect").mockReturnValue(surface);
  const rect = vi.spyOn(drawer, "getBoundingClientRect").mockReturnValue(new DOMRect(400, 10, 420, 400));
  expect(webSurfaceOcclusions(surface)).toEqual([{ x: 390, y: 0, width: 210, height: 400 }]);
  expect(webSurfacePanels(surface)).toEqual([]);
  expect(webSurfacePanels(new DOMRect(610, 10, 600, 400))).toEqual([]);
  expect(webSurfaceOcclusions(new DOMRect(610, 10, 600, 400))).toEqual([]);
  rect.mockReturnValue(new DOMRect(610, 10, 420, 400));
  expect(webSurfaceOcclusions(surface)).toEqual([]);
  expect(webSurfacePanels(surface)).toEqual([]);
});
it("never cuts out guest content for the persistent feedback footer", () => {
  const element = document.createElement("div");
  element.setAttribute("role", "status");
  element.style.cssText = "background: rgb(25,27,31); border: 1px solid rgb(48,52,58); border-radius: 4px";
  document.body.append(element);
  const bounds = vi.spyOn(element, "getBoundingClientRect");
  const surface = new DOMRect(10, 10, 400, 300);
  bounds.mockReturnValue(new DOMRect(10, 288, 180, 22));
  expect(webSurfacePanels(surface)).toEqual([]);
  bounds.mockReturnValue(new DOMRect(10, 300, 180, 22));
  const cuts = webSurfaceOcclusions(surface);
  expect(cuts).toEqual([]);
  expect(webSurfaceOcclusions(new DOMRect(500, 10, 400, 300))).toEqual([]);
  bounds.mockReturnValue(new DOMRect(10, 310, 180, 22));
  expect(webSurfaceOcclusions(surface)).toEqual([]);
  expect(webSurfacePanels(surface)).toEqual([]);
});
it("uses the same visible reveal boundary for native alpha chrome and the interior hole", () => {
  const element = document.createElement("div");
  element.dataset.appOverlay = "floating";
  element.style.cssText = "background: rgb(25, 27, 31); border: 1px solid rgb(48, 52, 58); border-top-left-radius: 6px; clip-path: inset(0px 0px 50% 0px round 6px)";
  document.body.append(element);
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 40, 240, 200));
  const surface = new DOMRect(10, 10, 400, 300);
  const panel = webHistoryPanel(element, surface)!;
  expect(panel.edge).toEqual({ x: 30, y: 30, width: 240, height: 100, radius: 6, stroke: 1, color: [48, 52, 58, 255] });
  expect(panel.background).toEqual([25, 27, 31, 255]);
  expect(webSurfacePanels(surface)).toEqual([panel]);
  expect(Math.max(...webSurfaceOcclusions(surface).map(cut => cut.y + cut.height))).toBeCloseTo(panel.edge.y + panel.edge.height);
  element.style.clipPath = "inset(0px 0px 100% 0px round 6px)";
  expect(webSurfacePanels(surface)).toEqual([]);
  expect(webSurfaceOcclusions(surface)).toEqual([]);
});
