import { blockIds } from "./layout";
import type { Workspace, WorkspaceDocument } from "./model";

export type WorkspaceCloseSide = "others" | "left" | "right";
export const workspaceCloseLabels: Record<WorkspaceCloseSide, string> = { others: "关闭其他工作区", left: "关闭左侧工作区", right: "关闭右侧工作区" };
export interface CloseRequest { title: string; detail: string; ids: string[]; execute: () => void }
export function createWorkspaceCloseRequest(workspace: Workspace, execute: () => void): CloseRequest {
  return { title: `关闭 ${workspace.name}？`, detail: "工作区内的布局和所有终端会话会同时关闭。", ids: blockIds(workspace.layout), execute };
}
export function workspaceCloseTargets(workspaces: Workspace[], anchorId: string, side: WorkspaceCloseSide): Workspace[] {
  const index = workspaces.findIndex(item => item.id === anchorId);
  if (index < 0) return [];
  return workspaces.filter((item, position) => item.id !== anchorId && (side === "others" || (side === "left" ? position < index : position > index)));
}
export function closeWorkspaceBatch(state: WorkspaceDocument, workspaceIds: string[], anchorId: string): WorkspaceDocument {
  if (!state.workspaces.some(item => item.id === anchorId)) return state;
  const targets = new Set(workspaceIds);
  const workspaces = state.workspaces.filter(item => item.id === anchorId || !targets.has(item.id));
  if (workspaces.length === state.workspaces.length) return state;
  return { ...state, workspaces, activeWorkspaceId: workspaces.some(item => item.id === state.activeWorkspaceId) ? state.activeWorkspaceId : anchorId };
}
