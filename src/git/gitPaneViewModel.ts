import type { GitChange } from "../lib/tauri/git";
import { gitRepositoryHistoryEntryKey } from "../workspace/gitRepositoryHistory";
import type { GitTarget } from "../workspace/model";
import type { GitCommitContextMenu, GitRepositoryOverlay, GitRepositoryOverlayKind, GitRepositorySubmenu } from "./gitPaneTypes";

export function gitTargetKey(target: GitTarget): string {
  return target.type === "unbound" ? "unbound" : gitRepositoryHistoryEntryKey(target);
}

export function repositoryOverlayEstimate(kind: GitRepositoryOverlayKind, branchCount: number): { width: number; height: number } {
  const width = kind === "branches" ? 336 : kind === "repositoryActions" ? 210 : kind === "mergeBranch" ? 420 : 292;
  const height = kind === "branches" ? Math.min(376, 118 + branchCount * 44) : kind === "operationLog" ? 300 : kind === "repositoryActions" ? 222 : kind === "mergeBranch" ? 184 : 190;
  return { width, height };
}

export function discardImpact(changes: GitChange[]): string {
  const untracked = changes.filter((change) => change.status === "U").length;
  const tracked = changes.length - untracked;
  if (tracked > 0 && untracked > 0) return `将把 ${tracked} 个已跟踪文件恢复到暂存区版本，并永久删除 ${untracked} 个未跟踪文件`;
  if (tracked > 0) return `将把 ${tracked} 个已跟踪文件恢复到暂存区版本`;
  return `将永久删除 ${untracked} 个未跟踪文件`;
}

export function fitRepositoryOverlay(anchor: DOMRect, width: number, height: number): Omit<GitRepositoryOverlay, "kind" | "repositoryPath"> {
  const gutter = 8;
  const offset = 4;
  const left = Math.max(gutter, Math.min(anchor.right - width, window.innerWidth - width - gutter));
  const below = anchor.bottom + offset;
  if (below + height <= window.innerHeight - gutter) return { left, top: below, placement: "below" };
  return { left, top: Math.max(gutter, anchor.top - height - offset), placement: "above" };
}

export function fitRepositorySubmenu(anchor: DOMRect, width: number, height: number): GitRepositorySubmenu {
  const gutter = 8;
  const offset = 4;
  const right = anchor.right + offset;
  const opensRight = right + width <= window.innerWidth - gutter;
  const left = opensRight ? Math.max(gutter, right) : Math.max(gutter, anchor.left - width - offset);
  const top = Math.max(gutter, Math.min(anchor.top, window.innerHeight - height - gutter));
  return { left, top, side: opensRight ? "right" : "left" };
}

export function fitCommitContextMenu(anchorX: number, anchorY: number, width: number, height: number): Pick<GitCommitContextMenu, "left" | "top" | "placement"> {
  const gutter = 8;
  const left = Math.max(gutter, Math.min(anchorX, window.innerWidth - width - gutter));
  if (anchorY + height <= window.innerHeight - gutter) return { left, top: Math.max(gutter, anchorY), placement: "below" };
  return { left, top: Math.max(gutter, anchorY - height), placement: "above" };
}
