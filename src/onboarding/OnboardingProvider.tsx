import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import { OnboardingContext } from "./OnboardingContext";
import { GuideCard } from "./GuideCard";
import { guideSteps, hasSeenOnboarding, markOnboardingSeen, type OnboardingMode } from "./onboardingState";
import "./onboarding.css";

function canShow(mode: OnboardingMode) {
  if (document.querySelector('[role="dialog"]:not(.onboarding-card)')) return false;
  return mode === "demo" || Boolean(document.querySelector('[data-onboarding-ready="true"]'));
}

export function OnboardingProvider({ mode, children }: { mode: OnboardingMode; children: ReactNode }) {
  const { hydrated } = useWorkspace();
  const [index, setIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const start = useCallback(() => {
    markOnboardingSeen(mode);
    setFlashing(false); setPaused(false); setIndex(0);
  }, [mode]);
  const finish = useCallback(() => { setIndex(null); setFlashing(true); }, []);
  const skip = useCallback(() => { setIndex(null); }, []);

  useEffect(() => {
    if (!hydrated || hasSeenOnboarding(mode)) return;
    const timer = window.setInterval(() => {
      if (hasSeenOnboarding(mode)) { clearInterval(timer); return; }
      if (canShow(mode)) { clearInterval(timer); start(); }
    }, 400);
    return () => clearInterval(timer);
  }, [hydrated, mode, start]);
  useEffect(() => {
    if (index === null) return;
    const update = () => setPaused(!canShow(mode));
    const timer = window.setInterval(update, 200);
    update();
    return () => clearInterval(timer);
  }, [index, mode]);
  useEffect(() => {
    if (!flashing) return;
    const timer = window.setTimeout(() => setFlashing(false), 2400);
    return () => clearTimeout(timer);
  }, [flashing]);

  const last = mode === "demo"
    ? { id: "restart", title: "随时重新查看", text: "页面底部的“重新引导”按钮会一直保留。点击完成后，可以从那里重新开始。", target: "restart" }
    : { id: "about", title: "在关于中重新查看", text: "以后需要重新查看时，可打开这里的“关于”，使用弹窗右上角的“使用引导”。现在点击完成即可开始使用。", target: "rail-help" };
  const steps = [...guideSteps, last];
  const step = index === null ? null : steps[index];
  return <OnboardingContext.Provider value={{ mode, start, flashing }}>
    {children}
    {step && !paused && <GuideCard {...step} index={index!} count={steps.length}
      onNext={() => index === steps.length - 1 ? finish() : setIndex(index! + 1)}
      onBack={() => setIndex(Math.max(0, index! - 1))} onSkip={skip}/>}
  </OnboardingContext.Provider>;
}
