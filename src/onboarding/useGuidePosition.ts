import { useLayoutEffect, useState, type RefObject } from "react";
import { placeGuideCard, type GuideRect } from "./guideGeometry";

export function useGuidePosition(card: RefObject<HTMLElement | null>, target: GuideRect | null, canvas: GuideRect | null) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      if (!card.current) return;
      const box = card.current.getBoundingClientRect();
      const next = placeGuideCard(target, canvas, box, { width: innerWidth, height: innerHeight });
      setPosition(previous => previous?.left === next.left && previous.top === next.top ? previous : next);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (card.current) observer?.observe(card.current);
    window.addEventListener("resize", update);
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [card, target, canvas]);
  return position;
}
