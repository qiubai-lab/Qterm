import type { ButtonHTMLAttributes, RefObject } from "react";

import { useThemedTooltip } from "./useThemedTooltip";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip: string;
  anchorRef?: RefObject<HTMLButtonElement | null>;
}

/** Shared action button with an application-themed, viewport-bound tooltip. */
export function ThemedTooltipButton({ tooltip, anchorRef, children, onClick, onMouseEnter, onMouseLeave, onFocus, onBlur, onKeyDown, ...props }: Props) {
  const [tooltipAnchorRef, descriptionId, hideTooltip, showTooltip, tooltipSurface] = useThemedTooltip<HTMLButtonElement>({ tooltip, anchorRef });
  return <>
    <button {...props} ref={tooltipAnchorRef} type={props.type ?? "button"} aria-describedby={descriptionId}
      onMouseEnter={event => { showTooltip(); onMouseEnter?.(event); }} onMouseLeave={event => { hideTooltip(); onMouseLeave?.(event); }}
      onFocus={event => { showTooltip(); onFocus?.(event); }} onBlur={event => { hideTooltip(); onBlur?.(event); }}
      onKeyDown={event => { if (event.key === "Escape") hideTooltip(); onKeyDown?.(event); }}
      onClick={event => { hideTooltip(); onClick?.(event); }}>{children}</button>
    {tooltipSurface}
  </>;
}
