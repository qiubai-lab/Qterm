import { blockIds } from "./layout";
import type { Workspace } from "./model";
import type { WorkspaceAction } from "./reducer";

export function openNetworkWindowAction(workspace: Workspace, profileId: string | null = null): WorkspaceAction {
  const ids = blockIds(workspace.layout);
  return {
    type: "openNetwork",
    workspaceId: workspace.id,
    anchorBlockId: ids.includes(workspace.activeBlockId) ? workspace.activeBlockId : ids[0],
    profileId,
  };
}
