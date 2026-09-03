import type { GitSnapshot, GitSubmodule, GitSubmoduleIssue } from "../lib/tauri/git";

export interface GitRepositoryTreeNode {
  id: string;
  path: string;
  parentPath: string | null;
  depth: number;
  name: string;
  relativePath: string;
  snapshot: GitSnapshot | null;
  submodule: GitSubmodule | null;
  selectable: boolean;
  expanded: boolean;
  hasChildren: boolean;
  state: string;
}

const issueLabels: Record<GitSubmoduleIssue, string> = {
  missingConfiguration: "缺少 .gitmodules 配置",
  missingGitlink: "缺少 gitlink",
  duplicatePath: "配置重复",
  invalidPath: "路径无效",
  unreadable: "状态不可读取",
};

const issueResolutionLabels: Record<GitSubmoduleIssue, string> = {
  missingConfiguration: "缺少 .gitmodules 配置。请修复对应路径配置后刷新仓库。",
  missingGitlink: "父仓库索引缺少 Gitlink。请恢复子模块引用后刷新仓库。",
  duplicatePath: "子模块名称或路径配置重复。请修正 .gitmodules 后刷新仓库。",
  invalidPath: "子模块路径无效。请修正 .gitmodules 中的相对路径后刷新仓库。",
  unreadable: "无法读取子模块状态。请检查路径、权限和 Git 配置后刷新仓库。",
};

export function gitSubmoduleState(submodule: GitSubmodule): string {
  if (submodule.issue) return issueLabels[submodule.issue];
  if (submodule.conflict) return "引用冲突";
  if (!submodule.initialized) return "未初始化";
  const details = [
    submodule.commitChanged ? "记录版本已变化" : null,
    submodule.trackedModified ? "内部有修改" : null,
    submodule.untrackedContent ? "内部有未跟踪内容" : null,
  ].filter(Boolean);
  return details.join(" · ") || "干净";
}

export function gitSubmoduleUnavailableReason(submodule: GitSubmodule): string | undefined {
  if (submodule.issue) return issueLabels[submodule.issue];
  if (submodule.conflict) return "子模块引用存在冲突";
  return undefined;
}

export function gitRepositorySelectionUnavailableReason(node: GitRepositoryTreeNode, disabled: boolean, remoteReady: boolean): string | null {
  const submodule = node.submodule;
  if (submodule?.issue) return issueResolutionLabels[submodule.issue];
  if (submodule?.conflict) return "子模块引用存在冲突。请先在父仓库解决该路径的合并冲突。";
  if (submodule && !submodule.initialized) return "子模块尚未初始化。请点击“初始化”后再选择。";
  if (!remoteReady) return "远程 Git 尚未连接。请恢复连接后再选择。";
  if (disabled) return "Git 操作正在进行。请等待当前操作完成后再选择。";
  return null;
}

export function joinGitRepositoryPath(parentPath: string, relativePath: string): string | null {
  if (!parentPath || !relativePath || relativePath.startsWith("/") || relativePath.startsWith("\\") || /^[a-z]:/iu.test(relativePath)) return null;
  const segments = relativePath.split(/[\\/]/u);
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\0"))) return null;
  const base = parentPath.replace(/[\\/]+$/u, "");
  return base ? `${base}/${segments.join("/")}` : null;
}

export function buildGitRepositoryTree(
  rootPath: string,
  snapshots: ReadonlyMap<string, GitSnapshot>,
  expandedPaths: ReadonlySet<string>,
): GitRepositoryTreeNode[] {
  if (!rootPath) return [];
  const nodes: GitRepositoryTreeNode[] = [];
  const visited = new Set<string>();

  function append(path: string, parentPath: string | null, depth: number, relativePath: string, submodule: GitSubmodule | null) {
    if (visited.has(path)) return;
    visited.add(path);
    const snapshot = snapshots.get(path) ?? null;
    const children = snapshot?.submodules ?? [];
    const expanded = parentPath === null || expandedPaths.has(path);
    const selectable = submodule === null || Boolean(submodule.initialized && !submodule.issue && !submodule.conflict);
    nodes.push({
      id: path,
      path,
      parentPath,
      depth,
      name: snapshot?.repositoryName ?? submodule?.name ?? relativePath,
      relativePath,
      snapshot,
      submodule,
      selectable,
      expanded,
      hasChildren: children.length > 0,
      state: submodule ? gitSubmoduleState(submodule) : "父仓库",
    });
    if (!expanded) return;
    for (const child of children) {
      const childPath = joinGitRepositoryPath(path, child.path);
      if (!childPath || visited.has(childPath)) continue;
      append(childPath, path, depth + 1, child.path, child);
    }
  }

  append(rootPath, null, 0, rootPath, null);
  return nodes;
}

export function gitRepositoryParentPath(nodes: readonly GitRepositoryTreeNode[], path: string): string | null {
  return nodes.find((node) => node.path === path)?.parentPath ?? null;
}
