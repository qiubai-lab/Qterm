const TOOLTIP_VIEWPORT_INSET = 8;
const TOOLTIP_GAP = 6;

export type GitCommitTooltipPlacement = "right" | "left" | "below" | "above";

export interface GitCommitTooltipPosition {
  placement: GitCommitTooltipPlacement;
  top: number;
  left: number;
}

export function calculateGitCommitTooltipPosition(
  anchor: Pick<DOMRect, "top" | "right" | "bottom" | "left">,
  tooltip: Pick<DOMRect, "width" | "height">,
  viewport: { width: number; height: number },
): GitCommitTooltipPosition {
  const maximumLeft = Math.max(TOOLTIP_VIEWPORT_INSET, viewport.width - TOOLTIP_VIEWPORT_INSET - tooltip.width);
  const maximumTop = Math.max(TOOLTIP_VIEWPORT_INSET, viewport.height - TOOLTIP_VIEWPORT_INSET - tooltip.height);
  const alignedTop = Math.min(Math.max(TOOLTIP_VIEWPORT_INSET, anchor.top), maximumTop);

  if (anchor.right + TOOLTIP_GAP + tooltip.width <= viewport.width - TOOLTIP_VIEWPORT_INSET) {
    return { placement: "right", top: alignedTop, left: anchor.right + TOOLTIP_GAP };
  }
  if (anchor.left - TOOLTIP_GAP - tooltip.width >= TOOLTIP_VIEWPORT_INSET) {
    return { placement: "left", top: alignedTop, left: anchor.left - TOOLTIP_GAP - tooltip.width };
  }

  const left = Math.min(Math.max(TOOLTIP_VIEWPORT_INSET, anchor.right - tooltip.width), maximumLeft);
  const belowTop = anchor.bottom + TOOLTIP_GAP;
  if (belowTop + tooltip.height <= viewport.height - TOOLTIP_VIEWPORT_INSET) {
    return { placement: "below", top: belowTop, left };
  }
  return { placement: "above", top: Math.max(TOOLTIP_VIEWPORT_INSET, anchor.top - TOOLTIP_GAP - tooltip.height), left };
}
