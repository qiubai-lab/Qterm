import { useWorkbenchActive } from "../workspace/workbenchActivity";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import { findLeaf } from "../workspace/layout";
import { listRetainedSessions } from "./services/runtimeSessions";

/** Ordinary document updates must not cancel the remainder of a recovery pass. */
export function ServerRuntimeRestore() {
  const enabled = useWorkbenchActive();
  const workspace = useWorkspace();
  const { hydrated } = workspace;
  const latest = useRef(workspace);
  useLayoutEffect(() => { latest.current = workspace; }, [workspace]);
  useEffect(() => {
    if (!enabled || !hydrated) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    async function restore() {
      try {
        const sessions = await listRetainedSessions();
        for (const session of sessions) {
          if (!active) return;
          if (!session.runtimeKey) continue;
          const current = latest.current;
          const leaf = current.document.workspaces.map(w => findLeaf(w.layout, session.runtimeKey!)).find(Boolean);
          try {
            if (leaf?.type === "terminal" && leaf.profileId === session.profileId && session.kind === "terminal") await current.restoreTerminalBlock(session);
            if (leaf?.type === "git" && leaf.target.type === "remote" && leaf.target.profileId === session.profileId && session.kind === "git") await current.restoreGitBlock(session);
            if (leaf?.type === "network" && leaf.profileId === session.profileId && session.kind === "network") await current.restoreNetworkBlock(session);
            if (leaf?.type === "files" && leaf.profileId === session.profileId && session.kind === "files") await current.restoreFileBlock(session);
          } catch { /* One failed attachment must not prevent other blocks from recovering. */ }
        }
      } catch {
        if (active) retry = setTimeout(() => void restore(), 3000);
      }
    }
    void restore();
    return () => { active = false; clearTimeout(retry); };
  }, [enabled, hydrated]);
  return null;
}
