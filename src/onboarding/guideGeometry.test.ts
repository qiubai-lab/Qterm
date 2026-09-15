import { expect, it } from "vitest";
import { guideHighlight, placeGuideCard } from "./guideGeometry";

const viewport = { width: 1200, height: 800 };
const card = { width: 340, height: 200 };
it("gives workspace selection equal vertical gutters and a separate left edge", () => {
  expect(guideHighlight({ left: 80, top: 5, width: 278, height: 30 }, viewport, true)).toEqual({ left: 76, top: 2, width: 285, height: 36 });
});
it("centers the welcome within the canvas rather than the page", () => {
  expect(placeGuideCard(null, { left: 20, top: 140, width: 1100, height: 620 }, card, viewport)).toEqual({ left: 400, top: 350 });
});
it("places workspace guidance below its target and rail guidance to the left", () => {
  expect(placeGuideCard({ left: 100, top: 0, width: 900, height: 40 }, null, card, viewport)).toEqual({ left: 380, top: 60 });
  expect(placeGuideCard({ left: 1140, top: 200, width: 50, height: 40 }, null, card, viewport)).toEqual({ left: 780, top: 120 });
});
it("keeps a narrow viewport card inside the visible area", () => {
  const result = placeGuideCard({ left: 340, top: 550, width: 20, height: 30 }, null, card, { width: 375, height: 600 });
  expect(result.left).toBeGreaterThanOrEqual(12);
  expect(result.left + card.width).toBeLessThanOrEqual(363);
  expect(result.top + card.height).toBeLessThanOrEqual(588);
});
it("draws a complete inset highlight without depending on exterior space", () => {
  expect(guideHighlight({ left: 0, top: 0, width: 1200, height: 40 }, viewport)).toEqual({ left: 2, top: 2, width: 1196, height: 36 });
  expect(guideHighlight({ left: 1150, top: 750, width: 50, height: 50 }, viewport)).toEqual({ left: 1152, top: 752, width: 46, height: 46 });
});
it("clips partially visible targets without negative highlight dimensions", () => {
  expect(guideHighlight({ left: -20, top: -10, width: 60, height: 30 }, viewport)).toEqual({ left: 2, top: 2, width: 36, height: 16 });
  const tiny = guideHighlight({ left: 1199, top: 799, width: 20, height: 20 }, viewport);
  expect(tiny.width).toBe(0.5);
  expect(tiny.height).toBe(0.5);
});
