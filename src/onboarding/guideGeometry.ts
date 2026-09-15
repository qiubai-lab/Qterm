export interface GuideRect { left: number; top: number; width: number; height: number }
interface Size { width: number; height: number }
const clamp = (value: number, max: number) => Math.max(12, Math.min(value, max - 12));

export function placeGuideCard(target: GuideRect | null, canvas: GuideRect | null, card: Size, viewport: Size) {
  const area = canvas ?? { left: 0, top: 0, ...viewport };
  const center = { left: area.left + (area.width - card.width) / 2, top: area.top + (area.height - card.height) / 2 };
  const fit = (point: { left: number; top: number }) => ({ left: clamp(point.left, viewport.width - card.width), top: clamp(point.top, viewport.height - card.height) });
  if (!target) return fit(center);
  const gap = 20;
  const below = { left: target.left + (target.width - card.width) / 2, top: target.top + target.height + gap };
  const above = { ...below, top: target.top - card.height - gap };
  const left = { left: target.left - card.width - gap, top: target.top + (target.height - card.height) / 2 };
  const right = { ...left, left: target.left + target.width + gap };
  const candidates = target.width < 80 && target.left > viewport.width * 0.75 ? [left, below, above, right] : [below, right, above, left];
  const point = candidates.map(fit).find(p => p.left + card.width <= target.left - 10 || p.left >= target.left + target.width + 10 || p.top + card.height <= target.top - 10 || p.top >= target.top + target.height + 10);
  return point ?? fit(center);
}

// Draw inside the visible target: desktop controls may sit directly on a window edge.
export function guideHighlight(rect: GuideRect, viewport: Size, workspace = false) {
  if (workspace) {
    const left = Math.max(1, rect.left - 4);
    const top = Math.max(1, rect.top - 3);
    return { left, top, width: Math.max(0, Math.min(viewport.width - 1, rect.left + rect.width + 3) - left), height: Math.max(0, Math.min(viewport.height - 1, rect.top + rect.height + 3) - top) };
  }
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const width = Math.max(0, Math.min(viewport.width, rect.left + rect.width) - left);
  const height = Math.max(0, Math.min(viewport.height, rect.top + rect.height) - top);
  const insetX = Math.min(2, width / 4);
  const insetY = Math.min(2, height / 4);
  return { left: left + insetX, top: top + insetY, width: width - insetX * 2, height: height - insetY * 2 };
}
