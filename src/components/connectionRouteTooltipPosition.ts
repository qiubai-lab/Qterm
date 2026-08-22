const TOOLTIP_VIEWPORT_INSET = 8;
const TOOLTIP_GAP = 4;

export interface ConnectionRouteTooltipPosition {
  placement: "above" | "below";
  top: number;
  left: number;
}

export function calculateConnectionRouteTooltipPosition(
  anchor: Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width">,
  tooltip: Pick<DOMRect, "width" | "height">,
  viewport: { width: number; height: number },
): ConnectionRouteTooltipPosition {
  const desiredLeft = anchor.left + (anchor.width - tooltip.width) / 2;
  const maximumLeft = Math.max(TOOLTIP_VIEWPORT_INSET, viewport.width - TOOLTIP_VIEWPORT_INSET - tooltip.width);
  const left = Math.min(Math.max(TOOLTIP_VIEWPORT_INSET, desiredLeft), maximumLeft);
  const belowTop = anchor.bottom + TOOLTIP_GAP;
  const aboveTop = anchor.top - TOOLTIP_GAP - tooltip.height;
  const placement = belowTop + tooltip.height <= viewport.height - TOOLTIP_VIEWPORT_INSET || aboveTop < TOOLTIP_VIEWPORT_INSET ? "below" : "above";
  const top = placement === "below" ? belowTop : Math.max(TOOLTIP_VIEWPORT_INSET, aboveTop);
  return { placement, top, left };
}
