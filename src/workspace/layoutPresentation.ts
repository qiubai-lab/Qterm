import type { CSSProperties } from "react";
import type { DropPosition } from "./layout";
import { layoutScalarCss, type LayoutBounds } from "./layoutGeometry";

export function dropPosition(rect: DOMRect, x: number, y: number): DropPosition {
  const relativeX = (x - rect.left) / rect.width;
  const relativeY = (y - rect.top) / rect.height;
  if (relativeX < 0.25) return "left";
  if (relativeX > 0.75) return "right";
  if (relativeY < 0.25) return "top";
  if (relativeY > 0.75) return "bottom";
  return "center";
}

export function boundsStyle(bounds: LayoutBounds): CSSProperties {
  return {
    left: layoutScalarCss(bounds.x),
    top: layoutScalarCss(bounds.y),
    width: layoutScalarCss(bounds.width),
    height: layoutScalarCss(bounds.height),
  };
}
