import { Button } from "../components/Button";
import { useOnboarding } from "./OnboardingContext";

export function OnboardingRestart({ onBeforeStart, className = "" }: { onBeforeStart?: () => void; className?: string }) {
  const guide = useOnboarding();
  if (!guide) return null;
  return <Button variant="quiet" size="compact" data-onboarding="restart" className={`${className}${guide.flashing ? " onboarding-replay-flash" : ""}`}
    onClick={() => { onBeforeStart?.(); guide.start(); }}><span>{guide.mode === "demo" ? "重新引导" : "使用引导"}</span></Button>;
}
