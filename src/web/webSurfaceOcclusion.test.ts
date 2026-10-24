import { afterEach, expect, it, vi } from "vitest";
import { webSurfaceOcclusions } from "./webSurfaceOcclusion";
import { webSurfaceVisible } from "./webModel";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });
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
  expect(webSurfaceOcclusions(rect)).toEqual([{ x: 18, y: 0, width: 64, height: 22 }]);
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
