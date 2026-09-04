import { useLayoutEffect, useState, type RefObject } from "react";

/** Observe the actual viewport, including spring-driven card movement and native scrolling. */
export function useWorkspaceTabScroll(strip: RefObject<HTMLElement | null>, enabled: boolean) {
  const [edges, setEdges] = useState({ left: false, right: false });
  useLayoutEffect(() => {
    const node = strip.current;
    if (!node) return;
    const update = () => {
      const left = enabled && node.scrollLeft > 1;
      const right = enabled && node.scrollWidth - node.clientWidth - node.scrollLeft > 1;
      setEdges(current => current.left === left && current.right === right ? current : { left, right });
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    node.addEventListener("scroll", update);
    node.addEventListener("workspace-tab-layout", update);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      node.removeEventListener("scroll", update);
      node.removeEventListener("workspace-tab-layout", update);
      window.removeEventListener("resize", update);
    };
  }, [strip, enabled]);
  return { ...edges, move: (direction: -1 | 1) => {
    const node = strip.current;
    if (!node) return;
    node.scrollTo({ left: Math.max(0, Math.min(node.scrollWidth - node.clientWidth, node.scrollLeft + direction * Math.max(43, node.clientWidth - 43))), behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  } };
}
