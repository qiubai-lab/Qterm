import { expect, it } from "vitest";
import { layoutWebTabDeck, WEB_TAB_LIMIT } from "./webTabDeck";

const ids = Array.from({ length: WEB_TAB_LIMIT }, (_, index) => `tab-${index}`);
it("keeps fixed compact widths when the header fits and restores them after folding", () => {
  const result = layoutWebTabDeck(ids, ids[0], null, 1200);
  expect(result.layout.stacked).toBe(false);
  expect(result.overflowing).toBe(false);
  expect(result.layout.cards.every(card => card.width === 112)).toBe(true);
});
it("folds neighbors while preserving selected and hovered cards and stable navigation", () => {
  for (const available of [800, 450, 220]) {
    const resting = layoutWebTabDeck(ids, ids[5], null, available);
    const hovered = layoutWebTabDeck(ids, ids[5], ids[2], available);
    expect(resting.layout.stacked).toBe(true);
    expect(resting.overflowing).toBe(hovered.overflowing);
    expect(hovered.layout.cards.filter(card => card.expanded).map(card => card.id)).toEqual([ids[2], ids[5]]);
    expect(hovered.layout.cards.every(card => card.width >= 28 && card.width <= 112)).toBe(true);
    expect(hovered.layout.cards[2].width).toBe(112);
    if (!hovered.overflowing) expect(hovered.layout.width + 29).toBeLessThanOrEqual(available);
  }
  expect(layoutWebTabDeck(ids, ids[0], null, 220).overflowing).toBe(true);
});
