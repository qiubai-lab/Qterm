import type { LayoutLeaf, LayoutNode, SplitDirection } from "./model";

export interface LayoutScalar { fraction: number; pixels: number }
export interface LayoutBounds { x: LayoutScalar; y: LayoutScalar; width: LayoutScalar; height: LayoutScalar }
export interface LayoutLeafGeometry { node: LayoutLeaf; bounds: LayoutBounds }
export interface LayoutDividerGeometry { id: string; direction: SplitDirection; ratio: number; bounds: LayoutBounds; containerBounds: LayoutBounds }
export interface LayoutGeometry { leaves: LayoutLeafGeometry[]; dividers: LayoutDividerGeometry[] }

const SPLIT_DIVIDER_SIZE = 3;
const ROOT_LAYOUT_BOUNDS: LayoutBounds = {
  x: { fraction: 0, pixels: 0 },
  y: { fraction: 0, pixels: 0 },
  width: { fraction: 1, pixels: 0 },
  height: { fraction: 1, pixels: 0 },
};

export function calculateLayoutGeometry(node: LayoutNode, liveRatios: Record<string, number> = {}): LayoutGeometry {
  const geometry: LayoutGeometry = { leaves: [], dividers: [] };
  visitLayout(node, ROOT_LAYOUT_BOUNDS, liveRatios, geometry);
  return geometry;
}

export function layoutScalarCss(value: LayoutScalar): string {
  const percentage = Number((value.fraction * 100).toFixed(6));
  const pixels = Number(value.pixels.toFixed(6));
  if (pixels === 0) return `${percentage}%`;
  if (percentage === 0) return `${pixels}px`;
  return `calc(${percentage}% ${pixels < 0 ? "-" : "+"} ${Math.abs(pixels)}px)`;
}

export function resolveLayoutBounds(bounds: LayoutBounds, width: number, height: number) {
  return {
    x: resolveScalar(bounds.x, width),
    y: resolveScalar(bounds.y, height),
    width: resolveScalar(bounds.width, width),
    height: resolveScalar(bounds.height, height),
  };
}

function visitLayout(node: LayoutNode, bounds: LayoutBounds, liveRatios: Record<string, number>, geometry: LayoutGeometry) {
  if (node.type !== "split") {
    geometry.leaves.push({ node, bounds });
    return;
  }
  const ratio = liveRatios[node.id] ?? node.ratio;
  if (node.direction === "horizontal") {
    const available = addPixels(bounds.width, -SPLIT_DIVIDER_SIZE);
    const firstWidth = scaleScalar(available, ratio);
    const dividerX = addScalar(bounds.x, firstWidth);
    visitLayout(node.first, { ...bounds, width: firstWidth }, liveRatios, geometry);
    geometry.dividers.push({
      id: node.id,
      direction: node.direction,
      ratio,
      bounds: { x: dividerX, y: bounds.y, width: scalar(0, SPLIT_DIVIDER_SIZE), height: bounds.height },
      containerBounds: bounds,
    });
    visitLayout(node.second, {
      x: addScalar(dividerX, scalar(0, SPLIT_DIVIDER_SIZE)),
      y: bounds.y,
      width: scaleScalar(available, 1 - ratio),
      height: bounds.height,
    }, liveRatios, geometry);
    return;
  }
  const available = addPixels(bounds.height, -SPLIT_DIVIDER_SIZE);
  const firstHeight = scaleScalar(available, ratio);
  const dividerY = addScalar(bounds.y, firstHeight);
  visitLayout(node.first, { ...bounds, height: firstHeight }, liveRatios, geometry);
  geometry.dividers.push({
    id: node.id,
    direction: node.direction,
    ratio,
    bounds: { x: bounds.x, y: dividerY, width: bounds.width, height: scalar(0, SPLIT_DIVIDER_SIZE) },
    containerBounds: bounds,
  });
  visitLayout(node.second, {
    x: bounds.x,
    y: addScalar(dividerY, scalar(0, SPLIT_DIVIDER_SIZE)),
    width: bounds.width,
    height: scaleScalar(available, 1 - ratio),
  }, liveRatios, geometry);
}

function scalar(fraction: number, pixels: number): LayoutScalar {
  return { fraction, pixels };
}

function addScalar(first: LayoutScalar, second: LayoutScalar): LayoutScalar {
  return scalar(first.fraction + second.fraction, first.pixels + second.pixels);
}

function addPixels(value: LayoutScalar, pixels: number): LayoutScalar {
  return scalar(value.fraction, value.pixels + pixels);
}

function scaleScalar(value: LayoutScalar, ratio: number): LayoutScalar {
  return scalar(value.fraction * ratio, value.pixels * ratio);
}

function resolveScalar(value: LayoutScalar, span: number): number {
  return Number((value.fraction * span + value.pixels).toFixed(6));
}
