import { sessionStartQueue } from "./sessionStartQueue";
import { useWorkbenchActive } from "../workspace/workbenchActivity";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import { blockIds, findLeaf } from "../workspace/layout";
import { listRetainedSessions } from "./services/runtimeSessions";

/** Ordinary document updates must not cancel the remainder of a recovery pass. */
export function ServerRuntimeRestore({ workspaceId, visible = true }: { workspaceId: string; visible?: boolean }) {
  const enabled = useWorkbenchActive();
  const workspace = useWorkspace();
  const { hydrated } = workspace;
  const owner = workspace.document.workspaces.find(w => w.id === workspaceId);
  useLayoutEffect(() => {
    if (!enabled || !visible || !owner) return;
    sessionStartQueue.foreground(blockIds(owner.layout), owner.activeBlockId);
    return () => sessionStartQueue.foreground([], undefined);
  }, [enabled, owner, visible]);
  const latest = useRef(workspace);
  useLayoutEffect(() => { latest.current = workspace; }, [workspace]);
  useEffect(() => {
    if (!enabled || !hydrated) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    async function restore() {
      try {
        const owner = latest.current.document.workspaces.find(w => w.id === workspaceId);
        if (!owner) return;
        const ids = blockIds(owner.layout);
        const sessions = await listRetainedSessions({ blockIds: ids });
        const priority = (session: typeof sessions[number]) => {
          if (session.kind === "terminal") return session.runtimeKey === owner.activeBlockId ? 0 : 1;
          return session.runtimeKey === owner.activeBlockId ? 2 : 3;
        };
        const ordered = sessions.filter(session => session.runtimeKey && ids.includes(session.runtimeKey)
          && session.status !== "closed" && session.status !== "failed")
          .sort((left, right) => priority(left) - priority(right));
        for (const session of ordered) {
          if (!active) return;
          if (!session.runtimeKey) continue;
          const current = latest.current;
          const latestOwner = current.document.workspaces.find(w => w.id === workspaceId);
          const leaf = latestOwner && findLeaf(latestOwner.layout, session.runtimeKey);
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
  }, [enabled, hydrated, workspaceId]);
  return null;
}
