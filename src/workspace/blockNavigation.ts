import { calculateLayoutGeometry, resolveLayoutBounds } from "./layoutGeometry";
import type { LayoutNode } from "./model";

export type BlockFocusDirection = "left" | "right" | "up" | "down";

export function adjacentBlockId(layout: LayoutNode, activeBlockId: string, direction: BlockFocusDirection): string | null {
  const leaves = calculateLayoutGeometry(layout).leaves.map(({ node, bounds }) => ({ node, bounds: resolveLayoutBounds(bounds, 1000, 1000) }));
  const active = leaves.find(({ node }) => node.blockId === activeBlockId);
  if (!active) return null;
  const activeCenter = center(active.bounds);
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;

  const candidates = leaves.flatMap((candidate) => {
    if (candidate.node.blockId === activeBlockId) return [];
    const candidateCenter = center(candidate.bounds);
    const primary = (horizontal ? candidateCenter.x - activeCenter.x : candidateCenter.y - activeCenter.y) * sign;
    if (primary <= 0) return [];
    const secondary = Math.abs(horizontal ? candidateCenter.y - activeCenter.y : candidateCenter.x - activeCenter.x);
    const overlaps = horizontal
      ? rangesOverlap(active.bounds.y, active.bounds.y + active.bounds.height, candidate.bounds.y, candidate.bounds.y + candidate.bounds.height)
      : rangesOverlap(active.bounds.x, active.bounds.x + active.bounds.width, candidate.bounds.x, candidate.bounds.x + candidate.bounds.width);
    return [{ id: candidate.node.blockId, score: primary + secondary * 4 + (overlaps ? 0 : 1000) }];
  });

  candidates.sort((first, second) => first.score - second.score);
  return candidates[0]?.id ?? null;
}

function center(bounds: { x: number; y: number; width: number; height: number }) {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function rangesOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): boolean {
  return Math.min(firstEnd, secondEnd) > Math.max(firstStart, secondStart);
}
