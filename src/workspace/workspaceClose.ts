import { blockIds, findLeaf, terminalBlockIds } from "./layout";
import type { Workspace, WorkspaceDocument } from "./model";

export type WorkspaceCloseSide = "others" | "left" | "right";
export const workspaceCloseLabels: Record<WorkspaceCloseSide, string> = { others: "关闭其他工作区", left: "关闭左侧工作区", right: "关闭右侧工作区" };
export interface CloseRequest { title: string; detail: string; subtitle?: string; confirmationRequired?: boolean; ids: string[]; execute: () => void }
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

export function canCloseBlock(workspace: Workspace, blockId: string): boolean {
  const leaf = findLeaf(workspace.layout, blockId);
  return Boolean(leaf && blockIds(workspace.layout).length > 1 &&
    (leaf.type !== "terminal" || terminalBlockIds(workspace.layout).length > 1));
}

export function createBlockCloseRequest(workspace: Workspace, blockId: string, execute: () => void): CloseRequest | null {
  if (!canCloseBlock(workspace, blockId)) return null;
  const type = findLeaf(workspace.layout, blockId)!.type;
  const messages = {
    terminal: { title: "关闭终端？", detail: "活动终端会话会同时断开，终端缓冲不会保留。", subtitle: "未保存的终端输出无法恢复" },
    files: { title: "关闭文件窗口？", detail: "活动文件连接会同时断开。", subtitle: "文件窗口将关闭" },
    network: { title: "关闭网络窗口？", detail: "活动网络转发和 SSH 连接会同时停止。", subtitle: "请确认当前网络转发不再需要" },
    git: { title: "关闭 Git 窗口？", detail: "活动 Git 连接会同时断开，仓库文件不会被删除。", subtitle: "Git 窗口将关闭" },
    web: { title: "关闭网页？", detail: "当前 Block 中的所有网页标签都将关闭，关闭后标签不会保留，再次打开也不会恢复。独立 SSH 连接会同时断开。", subtitle: "关闭后标签不会保留", confirmationRequired: true },
  };
  return { ...messages[type], ids: [blockId], execute };
}
