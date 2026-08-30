import { blockIds, findLeaf } from "./layout";
import type { GitTarget, Workspace } from "./model";
import type { WorkspaceAction } from "./reducer";
import type { TerminalRuntime } from "./workspaceRuntime";

export function openGitWindowAction(workspace: Workspace, runtimes: Record<string, TerminalRuntime>): WorkspaceAction {
  const anchorBlockId = blockIds(workspace.layout).includes(workspace.activeBlockId) ? workspace.activeBlockId : blockIds(workspace.layout)[0];
  const leaf = findLeaf(workspace.layout, anchorBlockId);
  let target: GitTarget = { type: "unbound" };
  if (leaf?.type === "files") {
    if (leaf.profileId === null && isAbsoluteLocalPath(leaf.path)) target = { type: "local", path: leaf.path };
    if (leaf.profileId !== null && isValidRemotePath(leaf.path)) target = { type: "remote", profileId: leaf.profileId, path: leaf.path };
  }
  if (leaf?.type === "terminal") {
    const runtime = runtimes[leaf.blockId];
    if (runtime?.cwdSource === "osc7" && runtime.cwd) {
      if (leaf.profileId === null && isAbsoluteLocalPath(runtime.cwd)) target = { type: "local", path: runtime.cwd };
      if (leaf.profileId !== null && isValidRemotePath(runtime.cwd)) target = { type: "remote", profileId: leaf.profileId, path: runtime.cwd };
    }
  }
  return { type: "openGit", workspaceId: workspace.id, anchorBlockId, target };
}

export function isAbsoluteLocalPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

export function isValidRemotePath(path: string): boolean {
  return path.length > 0 && path.length <= 4096 && !/[\0\r\n]/.test(path);
}
