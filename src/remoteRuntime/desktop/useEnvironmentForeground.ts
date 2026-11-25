import { useSyncExternalStore } from "react";
import { useDesktopHost } from "./context";
import { framePort } from "./frame";

const noopSubscribe = () => () => {};
const alwaysForeground = () => true;

/** Visual priority only. A background workbench still owns its sessions and drafts. */
export function useEnvironmentForeground() {
  const host = useDesktopHost();
  return useSyncExternalStore(
    framePort?.subscribe ?? host?.subscribe ?? noopSubscribe,
    framePort?.foreground ?? (host ? () => host.snapshot().active === "local" : alwaysForeground),
  );
}
