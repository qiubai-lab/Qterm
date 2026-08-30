import { blockIds, findLeaf } from "./layout";
import type { Workspace } from "./model";
import type { WorkspaceAction } from "./reducer";

export function openNetworkWindowAction(workspace: Workspace): WorkspaceAction {
  const ids = blockIds(workspace.layout);
  const anchorBlockId = ids.includes(workspace.activeBlockId) ? workspace.activeBlockId : ids[0];
  const anchor = findLeaf(workspace.layout, anchorBlockId);
  return {
    type: "openNetwork",
    workspaceId: workspace.id,
    anchorBlockId,
    profileId: anchor && anchor.type !== "git" ? anchor.profileId : null,
  };
}
