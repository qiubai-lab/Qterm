export const WORKSPACE_TAB_WIDTH = 128;
export const WORKSPACE_TAB_GAP = 3;
export interface DeckCard { id: string; x: number; width: number; expanded: boolean }
export interface DeckLayout { stacked: boolean; cards: DeckCard[]; width: number }

/** Share all remaining space among collapsed cards; only actual expanded cards reserve full width. */
export function layoutWorkspaceDeck(ids: string[], selectedId: string, previewId: string | null, available: number): DeckLayout {
  const natural = ids.length * (WORKSPACE_TAB_WIDTH + WORKSPACE_TAB_GAP) - WORKSPACE_TAB_GAP;
  const stacked = available > 0 && natural + 33 > available && ids.length > 1;
  const expandedCount = ids.filter(id => id === selectedId || id === previewId).length;
  const collapsed = Math.max(40, Math.min(WORKSPACE_TAB_WIDTH, (available - 33 - expandedCount * WORKSPACE_TAB_WIDTH - Math.max(0, ids.length - 1) * WORKSPACE_TAB_GAP) / Math.max(1, ids.length - expandedCount)));
  let x = 0;
  const cards = ids.map(id => {
    const expanded = !stacked || id === selectedId || id === previewId;
    const width = expanded ? WORKSPACE_TAB_WIDTH : collapsed;
    const card = { id, x, width, expanded };
    x += width + WORKSPACE_TAB_GAP;
    return card;
  });
  return { stacked, cards, width: Math.max(0, x - WORKSPACE_TAB_GAP) };
}
