export const GIT_CHANGE_ROW_HEIGHT = 27;
export const GIT_CHANGE_VIRTUAL_THRESHOLD = 160;
export const GIT_CHANGE_VIRTUAL_OVERSCAN = 8;
export const GIT_CHANGE_VIRTUAL_FALLBACK_ROWS = 18;

export interface GitChangeVirtualRange {
  start: number;
  end: number;
}

export function gitChangeVirtualFallbackRange(count: number): GitChangeVirtualRange {
  return {
    start: 0,
    end: Math.min(count, GIT_CHANGE_VIRTUAL_FALLBACK_ROWS + GIT_CHANGE_VIRTUAL_OVERSCAN),
  };
}

export function gitChangeVirtualRange({ count, listTop, viewportTop, viewportHeight }: {
  count: number;
  listTop: number;
  viewportTop: number;
  viewportHeight: number;
}): GitChangeVirtualRange {
  if (count <= 0 || viewportHeight <= 0) return { start: 0, end: 0 };
  const totalHeight = count * GIT_CHANGE_ROW_HEIGHT;
  const visibleTop = viewportTop - listTop;
  const visibleBottom = visibleTop + viewportHeight;
  if (visibleBottom <= 0 || visibleTop >= totalHeight) return { start: 0, end: 0 };
  const firstVisible = Math.floor(Math.max(0, visibleTop) / GIT_CHANGE_ROW_HEIGHT);
  const afterLastVisible = Math.ceil(Math.min(totalHeight, visibleBottom) / GIT_CHANGE_ROW_HEIGHT);
  return {
    start: Math.max(0, firstVisible - GIT_CHANGE_VIRTUAL_OVERSCAN),
    end: Math.min(count, afterLastVisible + GIT_CHANGE_VIRTUAL_OVERSCAN),
  };
}
