import { afterEach, expect, it, vi } from "vitest";
import { webFrameColor, webSurfaceFrame } from "./webSurfaceFrame";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

it("resolves theme colors and opacity from Chromium computed sRGB values", () => {
  expect(webFrameColor("rgb(255, 255, 0)", 1)).toEqual([255, 255, 0, 255]);
  expect(webFrameColor("rgba(117, 230, 207, 0.5)", 0.5)).toEqual([117, 230, 207, 64]);
  expect(webFrameColor("color(srgb 0.2 0.4 0.8 / 0.8)", 1)).toEqual([51, 102, 204, 204]);
  expect(webFrameColor("rgb(100% 0% 50% / 50%)", 1)).toEqual([255, 0, 128, 128]);
});

it("samples animated and reversed positions independently of webpage clipping", () => {
  const indicator = document.createElement("div");
  indicator.className = "active-block-indicator";
  indicator.style.cssText = "border: 1px solid rgb(255,255,0); border-radius:8px; opacity:1";
  indicator.style.borderTopLeftRadius = "8px";
  document.body.append(indicator);
  const rect = vi.spyOn(indicator, "getBoundingClientRect");
  const surface = new DOMRect(100, 100, 400, 300);
  for (const x of [0, 50, 150, 80, 30]) {
    rect.mockReturnValue(new DOMRect(x, 60, 300, 250));
    expect(webSurfaceFrame(surface)).toEqual({ x: x - 100, y: -40, width: 300, height: 250, radius: 8, stroke: 1, color: [255, 255, 0, 255] });
  }
  indicator.style.opacity = "0";
  expect(webSurfaceFrame(surface)).toBeNull();
});
