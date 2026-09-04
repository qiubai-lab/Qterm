import { describe, expect, it } from "vitest";
import { layoutWorkspaceDeck } from "./workspaceTabDeck";
const ids = Array.from({ length: 8 }, (_, i) => `w${i}`);
describe("workspace tab deck geometry", () => {
  it("keeps ordinary tabs when their natural width fits (AC-001)", () => {
    const layout = layoutWorkspaceDeck(ids.slice(0, 2), "w0", null, 400);
    expect(layout.stacked).toBe(false);
    expect(layout.cards.map(card => card.width)).toEqual([128, 128]);
    expect(layout.cards[1].x).toBe(131);
  });
  it("keeps selected and preview cards full while other cards stay targetable (AC-002)", () => {
    const layout = layoutWorkspaceDeck(ids, "w5", "w2", 600);
    expect(layout.stacked).toBe(true);
    expect(layout.cards.filter(card => card.expanded).map(card => card.id)).toEqual(["w2", "w5"]);
    expect(layout.cards.every(card => card.width >= 40)).toBe(true);
    expect(layout.width + 33).toBeLessThanOrEqual(600);
  });
  it("fills the available strip for both resting and preview states (AC-001)", () => {
    for (const available of [600, 900, 1077]) {
      for (const preview of [null, "w5", "w2", "missing"]) {
        const layout = layoutWorkspaceDeck(ids, "w5", preview, available);
        expect(layout.stacked).toBe(true);
        expect(layout.width + 33).toBeCloseTo(available);
        expect(layout.cards.every(card => card.width >= 40 && card.width <= 128)).toBe(true);
      }
    }
  });
  it("keeps the original hovered surface inside its expanded bounds (AC-002)", () => {
    const before = layoutWorkspaceDeck(ids, "w5", null, 600);
    for (const id of ids.filter(id => id !== "w5")) {
      const after = layoutWorkspaceDeck(ids, "w5", id, 600);
      const old = before.cards.find(card => card.id === id)!;
      const expanded = after.cards.find(card => card.id === id)!;
      expect(expanded.x).toBeLessThanOrEqual(old.x + .001);
      expect(expanded.x + expanded.width).toBeGreaterThanOrEqual(old.x + old.width - .001);
    }
  });
  it("falls back to scrolling instead of hiding targets or shrinking the selected card (AC-001)", () => {
    const layout = layoutWorkspaceDeck(ids, "w7", "w1", 280);
    expect(layout.width + 33).toBeGreaterThan(280);
    expect(layout.cards[7].width).toBe(128);
    expect(layout.cards.every(card => card.width >= 40)).toBe(true);
  });
  it("handles empty and unmeasured strips without invalid geometry", () => {
    expect(layoutWorkspaceDeck([], "", null, 0).width).toBe(0);
    expect(layoutWorkspaceDeck(ids, "w0", null, 0).stacked).toBe(false);
  });
});
