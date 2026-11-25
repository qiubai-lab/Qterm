import { createContext, useContext, useSyncExternalStore } from "react";
import type { DesktopEnvironments } from "./environments";
export const DesktopContext = createContext<DesktopEnvironments | null>(null);
export const useDesktopHost = () => useContext(DesktopContext);
export function useEnvironments(host: DesktopEnvironments) {
  return useSyncExternalStore(host.subscribe, host.snapshot);
}
