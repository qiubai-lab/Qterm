import { afterEach, expect, it, vi } from "vitest";
import { webSurfaceOcclusions } from "./webSurfaceOcclusion";
import { webSurfaceVisible } from "./webModel";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function overlay(role: string, rect: DOMRect) {
  const node = document.createElement("div");
  if (role === "indicator") { node.className = "active-block-indicator"; node.style.opacity = "1"; }
  else node.setAttribute("role", role);
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue(rect);
  document.body.append(node);
  return node;
}

it("keeps webpages visible under toolbar tooltips and clips only their overlapping footprint", () => {
  const surface = document.createElement("div"); document.body.append(surface);
  const rect = new DOMRect(100, 100, 400, 300);
  const tooltip = overlay("tooltip", new DOMRect(120, 90, 60, 30));
  expect(webSurfaceVisible(surface, true)).toBe(true);
  expect(webSurfaceOcclusions(rect)).toEqual([{ x: 20, y: 0, width: 60, height: 20 }]);
  tooltip.remove();
  overlay("tooltip", new DOMRect(10, 10, 40, 20));
  expect(webSurfaceOcclusions(rect)).toEqual([]);
});

it("never cuts webpage pixels for a moving or rounded selection frame", () => {
  const indicator = overlay("indicator", new DOMRect(120, 120, 200, 140));
  const surface = new DOMRect(100, 100, 400, 300);
  indicator.style.borderTopLeftRadius = "8px";
  expect(webSurfaceOcclusions(surface)).toEqual([]);
  vi.mocked(indicator.getBoundingClientRect).mockReturnValue(new DOMRect(95, 95, 410, 310));
  expect(webSurfaceOcclusions(surface)).toEqual([]);
  indicator.style.opacity = "0";
  expect(webSurfaceOcclusions(surface)).toEqual([]);
});

it("does not mistake list semantics for a modal and clips only the history panel footprint", () => {
  const element = document.createElement("div"); document.body.append(element);
  const surface = new DOMRect(100, 100, 400, 300);
  const list = overlay("listbox", new DOMRect(180, 80, 260, 220));
  expect(webSurfaceVisible(element, true)).toBe(true);
  list.dataset.webNativeOverlay = "address-history";
  expect(webSurfaceVisible(element, true)).toBe(true);
  expect(webSurfaceOcclusions(surface)).toEqual([{ x: 80, y: 0, width: 260, height: 200 }]);
  list.remove();
  expect(webSurfaceOcclusions(surface)).toEqual([]);
  const modal = overlay("dialog", new DOMRect(100, 100, 400, 300));
  modal.append(list);
  expect(webSurfaceVisible(element, true)).toBe(false);
});

it.each([1, 1.25, 1.5, 2, 3, 4])("preserves webpage pixels outside rounded history corners at %sx DPI", scale => {
  vi.stubGlobal("devicePixelRatio", scale);
  const surface = new DOMRect(100.2, 100.3, 400, 300);
  const list = overlay("listbox", new DOMRect(120.5, 110.6, 260, 220));
  list.dataset.webNativeOverlay = "address-history";
  list.style.borderTopLeftRadius = "6px";
  const cuts = webSurfaceOcclusions(surface).map(cut => ({
    left: Math.floor(cut.x * scale), top: Math.floor(cut.y * scale),
    right: Math.ceil((cut.x + cut.width) * scale), bottom: Math.ceil((cut.y + cut.height) * scale),
  }));
  const covers = (x: number, y: number) => cuts.some(cut => cut.left <= x && cut.right > x && cut.top <= y && cut.bottom > y);
  expect(cuts.length).toBeLessThanOrEqual(25);
  for (const x of [21, 279]) for (const y of [11, 229]) expect(covers(x * scale, y * scale)).toBe(false);
  // No horizontal seams between adjacent native bands, including fractional origins.
  for (let y = Math.ceil(11 * scale); y < Math.floor(230 * scale); y++) expect(covers(100 * scale, y)).toBe(true);
});

it("tracks the reveal edge and retains clipping for the closing accessible-hidden panel", () => {
  const surface = new DOMRect(0, 0, 400, 300);
  const list = overlay("listbox", new DOMRect(20, 20, 260, 200));
  list.dataset.webNativeOverlay = "address-history";
  list.style.borderTopLeftRadius = "6px";
  list.style.clipPath = "inset(0px 0px 50% 0px round 6px)";
  list.setAttribute("aria-hidden", "true");
  const cuts = webSurfaceOcclusions(surface);
  expect(cuts.length).toBeGreaterThan(1);
  expect(Math.max(...cuts.map(cut => cut.y + cut.height))).toBeCloseTo(120);
  list.style.clipPath = "inset(0px 0px 100% 0px round 6px)";
  expect(webSurfaceOcclusions(surface)).toEqual([]);
});

it("does not create rounded cutouts for history outside a guest or a subpixel reveal", () => {
  const list = overlay("listbox", new DOMRect(20, 20, 260, 200));
  list.dataset.webNativeOverlay = "address-history";
  list.style.borderTopLeftRadius = "6px";
  expect(webSurfaceOcclusions(new DOMRect(0, 250, 400, 300))).toEqual([]);
  expect(webSurfaceOcclusions(new DOMRect(0, -300, 400, 300))).toEqual([]);
  expect(webSurfaceOcclusions(new DOMRect(300, 0, 400, 300))).toEqual([]);
  list.style.clipPath = "inset(0px 0px 99.9% 0px round 6px)";
  expect(webSurfaceOcclusions(new DOMRect(0, 0, 400, 300))).toEqual([]);
});
