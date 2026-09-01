import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const gitRemoteConfigurationHint = "请先配置远端仓库地址，再进行拉取、推送或同步。";

export function GitRemoteConfigurationHint({ active, children }: { active: boolean; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const showTooltip = active && visible;

  useLayoutEffect(() => {
    if (!showTooltip || !anchorRef.current || !tooltipRef.current) return;
    const updatePosition = () => {
      const anchor = anchorRef.current?.querySelector<HTMLElement>("button");
      const tooltip = tooltipRef.current;
      if (!anchor || !tooltip) return;
      const rect = anchor.getBoundingClientRect();
      const gutter = 8;
      const offset = 7;
      const left = Math.max(gutter, Math.min(rect.left + (rect.width - tooltip.offsetWidth) / 2, window.innerWidth - tooltip.offsetWidth - gutter));
      const above = rect.top - tooltip.offsetHeight - offset;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${above >= gutter ? above : rect.bottom + offset}px`;
      tooltip.style.visibility = "visible";
      tooltip.dataset.placement = above >= gutter ? "above" : "below";
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showTooltip]);

  return <><span
    ref={anchorRef}
    className="git-remote-configuration-hint"
    onPointerEnter={() => active && setVisible(true)}
    onPointerLeave={() => setVisible(false)}
    onFocus={() => active && setVisible(true)}
    onBlur={() => setVisible(false)}
  >{children}</span>{showTooltip && createPortal(<div ref={tooltipRef} id={tooltipId} className="git-remote-configuration-tooltip" role="tooltip" data-placement="above" style={{ visibility: "hidden" }}>{gitRemoteConfigurationHint}</div>, document.body)}</>;
}
