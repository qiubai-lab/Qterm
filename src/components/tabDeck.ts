export interface DeckCard { id: string; x: number; width: number; expanded: boolean }
export interface DeckLayout { stacked: boolean; cards: DeckCard[]; width: number }
interface DeckSize { width: number; gap: number; minimum: number; reserved: number }

/** Share remaining space among collapsed cards, preserving full selected/preview cards. */
export function layoutTabDeck(ids: string[], selectedId: string, previewId: string | null, available: number, size: DeckSize): DeckLayout {
  const natural = ids.length * (size.width + size.gap) - size.gap;
  const stacked = available > 0 && natural + size.reserved > available && ids.length > 1;
  const expandedCount = ids.filter(id => id === selectedId || id === previewId).length;
  const collapsed = Math.max(size.minimum, Math.min(size.width, (available - size.reserved - expandedCount * size.width - Math.max(0, ids.length - 1) * size.gap) / Math.max(1, ids.length - expandedCount)));
  let x = 0;
  const cards = ids.map(id => {
    const expanded = !stacked || id === selectedId || id === previewId;
    const width = expanded ? size.width : collapsed;
    const card = { id, x, width, expanded };
    x += width + size.gap;
    return card;
  });
  return { stacked, cards, width: Math.max(0, x - size.gap) };
}

/** Qterm's critically damped deck spring; callers retain velocity across retargets. */
export function stepDeckSpring(value: number, velocity: number, target: number, dt: number, precision = .1) {
  velocity += (400 * (target - value) - 40 * velocity) * dt;
  value += velocity * dt;
  const settled = Math.abs(target - value) < precision && Math.abs(velocity) < precision * 5;
  return { value: settled ? target : value, velocity: settled ? 0 : velocity, settled };
}
