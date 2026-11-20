import { useWorkbenchActive } from "./workbenchActivity";
import { useEffect, type RefObject } from "react";
import { listRetainedSessions } from "@qterm/services/runtimeSessions";
import { isServer } from "../lib/runtime/environment";
import type { ConnectionProfile } from "@qterm/services/profiles";

type Owner = "files" | "git" | "terminal";
/** Existing server sessions restore without asking for credentials again. */
export function useBlockAutoConnect(owner: Owner, profile: ConnectionProfile | undefined, status: string, blockId: string, requestedRef: RefObject<string | null>, connect: (kind: Owner, block: string, profile: ConnectionProfile) => void) {
  const enabled = useWorkbenchActive();
  useEffect(() => {
    if (!enabled || !profile || status !== "closed" || requestedRef.current === profile.id) return;
    let active = true;
    const start = () => {
      if (!active) return;
      requestedRef.current = profile.id;
      connect(owner, blockId, profile);
    };
    let retry: number | undefined;
    const recover = () => {
      void listRetainedSessions({ blockId }).then(sessions => {
        if (!sessions.some(s => s.runtimeKey === blockId && s.kind === owner && s.profileId === profile.id)) start();
      }).catch(() => { if (active) retry = window.setTimeout(recover, 3000); });
    };
    if (isServer) recover(); else start();
    return () => { active = false; window.clearTimeout(retry); };
  }, [enabled, owner, blockId, connect, profile, requestedRef, status]);
}
