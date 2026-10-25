import { TabActionMenu } from "../components/TabActionMenu";
import type { Workspace } from "./model";
import { workspaceCloseLabels, workspaceCloseTargets, type WorkspaceCloseSide } from "./workspaceClose";

interface Props {
  anchorId: string; x: number; y: number; workspaces: Workspace[];
  onChoose: (side: WorkspaceCloseSide) => void;
  onDismiss: (restore?: boolean) => void;
}
export function WorkspaceTabMenu({ anchorId, workspaces, ...props }: Props) {
  const items = (Object.keys(workspaceCloseLabels) as WorkspaceCloseSide[]).map(id => ({ id, label: workspaceCloseLabels[id], count: workspaceCloseTargets(workspaces, anchorId, id).length }));
  return <TabActionMenu {...props} label="工作区操作" className="workspace-tab-menu" items={items}/>;
}
