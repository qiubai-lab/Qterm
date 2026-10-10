import { useSyncExternalStore } from "react";
import { getTerminalActivitySnapshot, subscribeTerminalActivity } from "./terminalActivityRegistry";

export function useTerminalActivity(sessionKey: string) {
  return useSyncExternalStore(subscribeTerminalActivity, () => getTerminalActivitySnapshot(sessionKey));
}
