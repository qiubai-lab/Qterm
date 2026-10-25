import { layoutTabDeck } from "../components/tabDeck";

export const WEB_TAB_LIMIT = 10;
export const WEB_TAB_WIDTH = 112;
export const WEB_TAB_OVERLAP = 6;
const size = { width: WEB_TAB_WIDTH, gap: 3, minimum: 28, reserved: 23 };

export function layoutWebTabDeck(ids: string[], selected: string, preview: string | null, available: number) {
  const natural = layoutTabDeck(ids, selected, preview, available, size);
  // Reserve arrows for the widest preview so hovering never inserts/removes controls.
  const widest = layoutTabDeck(ids, selected, ids.find(id => id !== selected) ?? null, available, size);
  const overflowing = available > 0 && widest.width + size.reserved + (widest.stacked ? WEB_TAB_OVERLAP : 0) > available;
  const layout = natural.stacked
    ? layoutTabDeck(ids, selected, preview, Math.max(1, available - WEB_TAB_OVERLAP - (overflowing ? 46 : 0)), size)
    : natural;
  return { layout, overflowing };
}
