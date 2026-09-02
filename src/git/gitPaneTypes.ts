import type { GitChange, GitCommit, GitCommitFile } from "../lib/tauri/git";

export type GitChangeScope = "staged" | "unstaged";

export interface GitChangeMenuState {
  left: number;
  top: number;
  placement: "above" | "below";
  scope: GitChangeScope;
  paths: string[];
  canStage: boolean;
  canDiscard: boolean;
}

export interface GitDiscardConfirmation { changes: GitChange[] }

export type GitRepositoryOverlayKind =
  | "branches"
  | "createBranch"
  | "createBranchFrom"
  | "createBranchFromCommit"
  | "renameBranch"
  | "deleteBranch"
  | "repositoryActions"
  | "mergeBranch"
  | "abortMerge"
  | "publishBranch"
  | "operationLog";

export interface GitRepositoryOverlay {
  kind: GitRepositoryOverlayKind;
  repositoryPath: string;
  left: number;
  top: number;
  placement: "above" | "below";
}

export interface GitRepositorySubmenu {
  left: number;
  top: number;
  side: "left" | "right";
}

export interface GitCommitContextMenu {
  commit: GitCommit;
  anchorX: number;
  anchorY: number;
  left: number;
  top: number;
  placement: "above" | "below";
}

export interface GitCommitFilesState {
  status: "loading" | "ready" | "error";
  files: GitCommitFile[];
  message?: string;
}

export interface GitMergeConfirmation {
  sourceRef: string;
  sourceName: string;
  targetName: string;
}

export interface GitOperationRecord {
  id: number;
  name: string;
  status: "running" | "success" | "attention" | "error";
  startedAt: number;
  durationMs?: number;
  detail: string;
}

export const branchOverlayKinds = new Set<GitRepositoryOverlayKind>([
  "branches",
  "createBranch",
]);

export function visibleOperationDetail(detail: string): string {
  return detail
    .replace(/((?:https?|ssh):\/\/)[^/@\s]+@/gi, "$1***@")
    .slice(0, 480);
}

export function operationStatusLabel(status: GitOperationRecord["status"]): string {
  if (status === "running") return "进行中";
  if (status === "success") return "成功";
  if (status === "attention") return "需要处理";
  return "失败";
}

export function formatRelativeCommitTime(timestamp: number): string {
  if (!timestamp) return "";
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (elapsed < 60) return "刚刚";
  if (elapsed < 3_600) return `${Math.floor(elapsed / 60)} 分钟前`;
  if (elapsed < 86_400) return `${Math.floor(elapsed / 3_600)} 小时前`;
  if (elapsed < 2_592_000) return `${Math.floor(elapsed / 86_400)} 天前`;
  if (elapsed < 31_536_000) return `${Math.floor(elapsed / 2_592_000)} 个月前`;
  return `${Math.floor(elapsed / 31_536_000)} 年前`;
}

export function gitFailureTitle(code: string): string {
  if (code === "gitMissing") return "远程主机未安装 Git";
  if (code === "gitUnsupportedRemote") return "远程环境不受支持";
  if (code === "gitPermissionDenied") return "无法访问远程仓库";
  if (code === "gitSessionUnavailable") return "远程 Git 连接已中断";
  return "无法读取 Git 仓库";
}
