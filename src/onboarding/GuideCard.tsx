import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAppTheme } from "../app/theme/AppThemeProvider";
import { Button } from "../components/Button";
import { useGuideTarget } from "./useGuideTarget";
import { useGuidePosition } from "./useGuidePosition";
import { guideHighlight } from "./guideGeometry";

interface Props {
  title: string; text: string; target: string | null;
  index: number; count: number;
  onNext: () => void; onBack: () => void; onSkip: () => void;
}
export function GuideCard({ title, text, target, index, count, onNext, onBack, onSkip }: Props) {
  const { theme } = useAppTheme();
  const rect = useGuideTarget(target);
  const canvas = useGuideTarget("canvas");
  const card = useRef<HTMLElement>(null);
  const position = useGuidePosition(card, rect, canvas);
  const highlight = rect ? guideHighlight(rect, { width: innerWidth, height: innerHeight }, target === "workspaces") : null;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const current = card.current;
    return () => { if (current?.contains(document.activeElement) && previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { card.current?.focus(); }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onSkip(); }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [onSkip]);
  return createPortal(<>
    {highlight && <div className="onboarding-highlight" data-demo-theme={theme} style={highlight} aria-hidden="true"/>}
    <section className="onboarding-card" data-demo-theme={theme} style={{ transform: position ? `translate3d(${position.left}px, ${position.top}px, 0)` : undefined, visibility: position ? "visible" : "hidden" }} ref={card} role="dialog" aria-modal="false" aria-label="使用引导" tabIndex={-1}>
      <div className="onboarding-progress">使用引导 · {index + 1} / {count}</div>
      <div aria-live="polite"><h2>{title}</h2><p>{text}</p></div>
      {!rect && target && <p className="onboarding-hint">当前布局未显示此入口，可在宽屏工作台中查看。</p>}
      <footer><Button variant="quiet" onClick={onSkip}>跳过</Button><span/>
        {index > 0 && <Button variant="quiet" onClick={onBack}>上一步</Button>}
        {<Button className="onboarding-next" onClick={onNext}>{index === count - 1 ? "完成" : index === 0 ? "开始引导" : "下一步"}</Button>}
      </footer>
    </section>
  </>, document.body);
}
