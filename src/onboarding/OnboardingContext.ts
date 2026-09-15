import { createContext, useContext } from "react";
import type { OnboardingMode } from "./onboardingState";

interface OnboardingContextValue {
  mode: OnboardingMode;
  flashing: boolean;
  start: () => void;
}
export const OnboardingContext = createContext<OnboardingContextValue | null>(null);
export const useOnboarding = () => useContext(OnboardingContext);
