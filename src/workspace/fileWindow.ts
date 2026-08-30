import { blockIds, findLeaf } from "./layout";
import type { Workspace } from "./model";
import type { WorkspaceAction } from "./reducer";
import type { TerminalRuntime } from "./workspaceRuntime";

export function openFileWindowAction(
  workspace: Workspace,
  terminalRuntimes: Readonly<Record<string, TerminalRuntime>>,
  osc7Enabled: boolean,
): WorkspaceAction {
  const ids = blockIds(workspace.layout);
  const anchorBlockId = ids.includes(workspace.activeBlockId) ? workspace.activeBlockId : ids[0];
  const anchor = findLeaf(workspace.layout, anchorBlockId);
  const profileId = anchor && anchor.type !== "git" ? anchor.profileId : null;
  const runtime = anchor?.type === "terminal" ? terminalRuntimes[anchor.blockId] : null;
  const osc7Path = osc7Enabled
    && runtime?.status === "connected"
    && runtime.cwdSource === "osc7"
    && runtime.cwd?.trim()
      ? runtime.cwd
      : null;
  return {
    type: "openFiles",
    workspaceId: workspace.id,
    anchorBlockId,
    profileId,
    path: osc7Path ?? (profileId === null ? "~" : "."),
  };
}
