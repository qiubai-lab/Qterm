import { layoutTabDeck, type DeckLayout } from "../components/tabDeck";
export type { DeckCard, DeckLayout } from "../components/tabDeck";
export const WORKSPACE_TAB_WIDTH = 128;
export const WORKSPACE_TAB_GAP = 3;

/** Share all remaining space among collapsed cards; only actual expanded cards reserve full width. */
export function layoutWorkspaceDeck(ids: string[], selectedId: string, previewId: string | null, available: number): DeckLayout {
  return layoutTabDeck(ids, selectedId, previewId, available, { width: WORKSPACE_TAB_WIDTH, gap: WORKSPACE_TAB_GAP, minimum: 40, reserved: 33 });
}
