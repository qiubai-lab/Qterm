import { blockIds } from "./layout";
import type { Workspace } from "./model";
import type { WorkspaceAction } from "./reducer";

export function openFileWindowAction(workspace: Workspace): WorkspaceAction {
  return {
    type: "openFiles",
    workspaceId: workspace.id,
    anchorBlockId: blockIds(workspace.layout).includes(workspace.activeBlockId)
      ? workspace.activeBlockId
      : blockIds(workspace.layout)[0],
    profileId: null,
    path: ".",
  };
}
