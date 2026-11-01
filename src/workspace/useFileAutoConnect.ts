import { useEffect, type RefObject } from "react";
import { listRetainedSessions } from "@qterm/services/runtimeSessions";
import { isServer } from "../lib/runtime/environment";
import type { ConnectionProfile } from "@qterm/services/profiles";

/** Existing server sessions restore without asking for credentials again. */
export function useFileAutoConnect(profile: ConnectionProfile | undefined, status: string, blockId: string, requestedRef: RefObject<string | null>, connect: (kind: "files", block: string, profile: ConnectionProfile) => void) {
  useEffect(() => {
    if (!profile || status !== "closed" || requestedRef.current === profile.id) return;
    let active = true;
    const start = () => {
      if (!active) return;
      requestedRef.current = profile.id;
      connect("files", blockId, profile);
    };
    if (isServer) {
      void listRetainedSessions().then(sessions => {
        if (!sessions.some(s => s.runtimeKey === blockId && s.kind === "files" && s.profileId === profile.id)) start();
      }).catch(() => undefined);
    } else start();
    return () => { active = false; };
  }, [blockId, connect, profile, requestedRef, status]);
}
