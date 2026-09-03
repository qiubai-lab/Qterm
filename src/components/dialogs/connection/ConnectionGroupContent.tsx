import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function ConnectionGroupContent({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const initializedRef = useRef(false);
  const [present, setPresent] = useState(expanded);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Read before cancelling so a reversal continues from the visible position.
    const height = container.getBoundingClientRect().height;
    const opacity = getComputedStyle(container).opacity;
    const targetHeight = expanded ? contentRef.current?.getBoundingClientRect().height ?? 0 : 0;
    animationRef.current?.cancel();
    animationRef.current = null;
    container.style.height = expanded ? "auto" : "0px";
    container.style.opacity = expanded ? "1" : "0";
    delete container.dataset.animating;
    setPresent(expanded);

    const initial = !initializedRef.current;
    initializedRef.current = true;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const keyboardToggle = document.activeElement?.matches(".connection-group-toggle:focus-visible");
    if (initial || height === targetHeight || reduceMotion || keyboardToggle || !container.animate) return;

    setPresent(true);
    container.dataset.animating = "true";
    const animation = container.animate([
      { height: `${height}px`, opacity },
      { height: `${targetHeight}px`, opacity: expanded ? 1 : 0 },
    ], { duration: expanded ? 180 : 140, easing: "cubic-bezier(.2,.8,.2,1)" });
    animationRef.current = animation;
    void animation.finished.then(() => {
      if (animationRef.current !== animation) return;
      animationRef.current = null;
      delete container.dataset.animating;
      setPresent(expanded);
    }).catch(() => undefined);
  }, [expanded]);

  useLayoutEffect(() => () => {
    animationRef.current?.cancel();
    animationRef.current = null;
  }, []);

  return <div className="connection-group-content" ref={containerRef} inert={!expanded} aria-hidden={!expanded}>
    {(expanded || present) && <div className="connection-group-items" ref={contentRef}>{children}</div>}
  </div>;
}
