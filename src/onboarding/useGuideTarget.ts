import { useLayoutEffect, useState } from "react";

import type { GuideRect } from "./guideGeometry";
const selectors: Record<string, string> = { canvas: ".workspace-stage-content", "terminal-connection": '[data-onboarding="terminal"] .terminal-target-trigger', "terminal-actions": '[data-onboarding="terminal"] .terminal-header-actions' };
export function useGuideTarget(target: string | null) {
  const [rect, setRect] = useState<GuideRect | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      const elements = target ? document.querySelectorAll<HTMLElement>(selectors[target] ?? `[data-onboarding="${target}"]`) : [];
      const element = Array.from(elements).find(item => !item.closest('[hidden], [aria-hidden="true"]') && item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0);
      let box = element?.getBoundingClientRect();
      if (target === "workspaces" && element && box) {
        // Exclude the tab bar's flexible empty space, and clip scrolled tabs to their viewport.
        const regions = Array.from(element.querySelectorAll<HTMLElement>(".workspace-tab, .new-workspace-slot, .workspace-tab-scroll"))
          .map(item => {
            const bounds = item.getBoundingClientRect();
            const clip = item.closest(".workspace-tab-strip")?.getBoundingClientRect() ?? box!;
            return { left: Math.max(bounds.left, clip.left), top: Math.max(bounds.top, clip.top), right: Math.min(bounds.right, clip.right), bottom: Math.min(bounds.bottom, clip.bottom) };
          }).filter(item => item.right > item.left && item.bottom > item.top);
        const tabs = Array.from(element.querySelectorAll<HTMLElement>(".workspace-tab")).map(item => item.getBoundingClientRect()).filter(item => item.width > 0 && item.height > 0);
        const vertical = tabs.length ? tabs : regions;
        if (regions.length) box = DOMRect.fromRect({ x: Math.min(...regions.map(item => item.left)), y: Math.min(...vertical.map(item => item.top)),
          width: Math.max(...regions.map(item => item.right)) - Math.min(...regions.map(item => item.left)),
          height: Math.max(...vertical.map(item => item.bottom)) - Math.min(...vertical.map(item => item.top)) });
      }
      const left = Math.max(0, box?.left ?? 0);
      const top = Math.max(0, box?.top ?? 0);
      const right = Math.min(innerWidth, box?.right ?? 0);
      const bottom = Math.min(innerHeight, box?.bottom ?? 0);
      const next = box && right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
      setRect(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"] });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(document.body);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); resize?.disconnect(); window.removeEventListener("resize", schedule); document.removeEventListener("scroll", schedule, true); };
  }, [target]);
  return rect;
}
