import { blockIds, clearTerminalRestoreDirectories, closeTerminal, findLeaf, moveTerminal, setFilesPath, setFilesProfile, setGitTarget, setNetworkProfile, setTerminalProfile, setTerminalRestoreDirectory, splitTerminal, terminalBlockIds, updateSplitRatio, type DropPosition } from "./layout";
import { recordRecentGitRepository } from "./gitRepositoryHistory";
import { createFilesNode, createGitNode, createId, createNetworkNode, createTerminalNode, createWorkspace, isValidTerminalRestoreDirectory, type GitRepositoryHistoryEntry, type GitTarget, type SplitDirection, type Workspace, type WorkspaceDocument } from "./model";

export type WorkspaceAction =
  | { type: "hydrate"; document: WorkspaceDocument }
  | { type: "recordRecentProfile"; profileId: string | null }
  | { type: "recordRecentGitRepository"; repository: GitRepositoryHistoryEntry }
  | { type: "selectWorkspace"; workspaceId: string }
  | { type: "addWorkspace" }
  | { type: "renameWorkspace"; workspaceId: string; name: string }
  | { type: "closeWorkspace"; workspaceId: string }
  | { type: "reorderWorkspace"; workspaceId: string; targetWorkspaceId: string }
  | { type: "selectBlock"; workspaceId: string; blockId: string }
  | { type: "splitBlock"; workspaceId: string; blockId: string; direction: SplitDirection; newBlockId: string; splitId: string }
  | { type: "openFiles"; workspaceId: string; anchorBlockId: string; profileId: string | null; path: string }
  | { type: "openNetwork"; workspaceId: string; anchorBlockId: string; profileId: string | null }
  | { type: "openGit"; workspaceId: string; anchorBlockId: string; target: GitTarget }
  | { type: "closeBlock"; workspaceId: string; blockId: string }
  | { type: "resizeSplit"; workspaceId: string; splitId: string; ratio: number }
  | { type: "setBlockProfile"; workspaceId: string; blockId: string; profileId: string | null }
  | { type: "setTerminalRestoreDirectory"; workspaceId: string; blockId: string; profileId: string | null; restoreDirectory: string | null }
  | { type: "clearTerminalRestoreDirectories" }
  | { type: "setFilesPath"; workspaceId: string; blockId: string; profileId: string | null; path: string }
  | { type: "setFilesProfile"; workspaceId: string; blockId: string; profileId: string | null }
  | { type: "setNetworkProfile"; workspaceId: string; blockId: string; profileId: string | null }
  | { type: "setGitTarget"; workspaceId: string; blockId: string; target: GitTarget }
  | { type: "moveBlock"; workspaceId: string; sourceId: string; targetId: string; position: DropPosition };

export function workspaceReducer(state: WorkspaceDocument, action: WorkspaceAction): WorkspaceDocument {
  switch (action.type) {
    case "hydrate": return action.document;
    case "recordRecentProfile": {
      if (!action.profileId) return state;
      return { ...state, recentProfileIds: [action.profileId, ...state.recentProfileIds.filter((id) => id !== action.profileId)].slice(0, 6) };
    }
    case "recordRecentGitRepository": {
      const recentGitRepositories = recordRecentGitRepository(state.recentGitRepositories, action.repository);
      return recentGitRepositories === state.recentGitRepositories ? state : { ...state, recentGitRepositories };
    }
    case "selectWorkspace": return state.workspaces.some((workspace) => workspace.id === action.workspaceId) ? { ...state, activeWorkspaceId: action.workspaceId } : state;
    case "addWorkspace": {
      const occupiedNames = new Set(state.workspaces.map(workspace => workspace.name));
      let number = 1;
      while (occupiedNames.has(`工作区-${number}`)) number += 1;
      const workspace = createWorkspace(`工作区-${number}`);
      return { ...state, activeWorkspaceId: workspace.id, workspaces: [...state.workspaces, workspace] };
    }
    case "renameWorkspace": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, name: cleanName(action.name, workspace.name) }));
    case "closeWorkspace": {
      if (state.workspaces.length === 1) return state;
      const index = state.workspaces.findIndex((workspace) => workspace.id === action.workspaceId);
      if (index < 0) return state;
      const workspaces = state.workspaces.filter((workspace) => workspace.id !== action.workspaceId);
      const activeWorkspaceId = state.activeWorkspaceId === action.workspaceId
        ? workspaces[Math.min(index, workspaces.length - 1)].id
        : state.activeWorkspaceId;
      return { ...state, activeWorkspaceId, workspaces };
    }
    case "reorderWorkspace": return reorderWorkspace(state, action.workspaceId, action.targetWorkspaceId);
    case "selectBlock": return mapWorkspace(state, action.workspaceId, (workspace) => {
      if (!blockIds(workspace.layout).includes(action.blockId) || workspace.activeBlockId === action.blockId) return workspace;
      return { ...workspace, activeBlockId: action.blockId };
    });
    case "splitBlock": return mapWorkspace(state, action.workspaceId, (workspace) => {
      const anchor = findLeaf(workspace.layout, action.blockId);
      if (!anchor) return workspace;
      const terminal = createTerminalNode(anchor.type === "git" ? null : anchor.profileId, action.newBlockId);
      return { ...workspace, activeBlockId: terminal.blockId, layout: splitTerminal(workspace.layout, action.blockId, action.direction, terminal, action.splitId) };
    });
    case "openFiles": return mapWorkspace(state, action.workspaceId, (workspace) => {
      const files = createFilesNode(action.profileId, action.path);
      return { ...workspace, activeBlockId: files.blockId, layout: splitTerminal(workspace.layout, action.anchorBlockId, "horizontal", files, createId("split")) };
    });
    case "openNetwork": return mapWorkspace(state, action.workspaceId, (workspace) => {
      const network = createNetworkNode(action.profileId);
      return { ...workspace, activeBlockId: network.blockId, layout: splitTerminal(workspace.layout, action.anchorBlockId, "horizontal", network, createId("split")) };
    });
    case "openGit": return mapWorkspace(state, action.workspaceId, (workspace) => {
      const git = createGitNode(action.target);
      return { ...workspace, activeBlockId: git.blockId, layout: splitTerminal(workspace.layout, action.anchorBlockId, "horizontal", git, createId("split")) };
    });
    case "closeBlock": return mapWorkspace(state, action.workspaceId, (workspace) => {
      if (blockIds(workspace.layout).length === 1) return workspace;
      if (findLeaf(workspace.layout, action.blockId)?.type === "terminal" && terminalBlockIds(workspace.layout).length === 1) return workspace;
      const layout = closeTerminal(workspace.layout, action.blockId);
      if (!layout) return workspace;
      const remaining = blockIds(layout);
      return { ...workspace, layout, activeBlockId: workspace.activeBlockId === action.blockId ? remaining[0] : workspace.activeBlockId };
    });
    case "resizeSplit": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, layout: updateSplitRatio(workspace.layout, action.splitId, action.ratio) }));
    case "setBlockProfile": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, layout: setTerminalProfile(workspace.layout, action.blockId, action.profileId) }));
    case "setTerminalRestoreDirectory": {
      if (action.restoreDirectory !== null && !isValidTerminalRestoreDirectory(action.restoreDirectory)) return state;
      return mapWorkspace(state, action.workspaceId, (workspace) => {
        const layout = setTerminalRestoreDirectory(workspace.layout, action.blockId, action.profileId, action.restoreDirectory);
        return layout === workspace.layout ? workspace : { ...workspace, layout };
      });
    }
    case "clearTerminalRestoreDirectories": {
      let changed = false;
      const workspaces = state.workspaces.map((workspace) => {
        const layout = clearTerminalRestoreDirectories(workspace.layout);
        if (layout === workspace.layout) return workspace;
        changed = true;
        return { ...workspace, layout };
      });
      return changed ? { ...state, workspaces } : state;
    }
    case "setFilesPath": return mapWorkspace(state, action.workspaceId, (workspace) => {
      const leaf = findLeaf(workspace.layout, action.blockId);
      if (!leaf || leaf.type !== "files" || leaf.profileId !== action.profileId) return workspace;
      return { ...workspace, layout: setFilesPath(workspace.layout, action.blockId, action.path) };
    });
    case "setFilesProfile": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, layout: setFilesProfile(workspace.layout, action.blockId, action.profileId) }));
    case "setNetworkProfile": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, layout: setNetworkProfile(workspace.layout, action.blockId, action.profileId) }));
    case "setGitTarget": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, layout: setGitTarget(workspace.layout, action.blockId, action.target) }));
    case "moveBlock": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, activeBlockId: action.sourceId, layout: moveTerminal(workspace.layout, action.sourceId, action.targetId, action.position, createId("split")) }));
  }
}

function mapWorkspace(state: WorkspaceDocument, id: string, update: (workspace: Workspace) => Workspace): WorkspaceDocument {
  let changed = false;
  const workspaces = state.workspaces.map((workspace) => {
    if (workspace.id !== id) return workspace;
    const next = update(workspace);
    changed = next !== workspace;
    return next;
  });
  return changed ? { ...state, workspaces } : state;
}

function reorderWorkspace(state: WorkspaceDocument, workspaceId: string, targetWorkspaceId: string): WorkspaceDocument {
  const from = state.workspaces.findIndex((workspace) => workspace.id === workspaceId);
  const to = state.workspaces.findIndex((workspace) => workspace.id === targetWorkspaceId);
  if (from < 0 || to < 0 || from === to) return state;
  const workspaces = [...state.workspaces];
  const [workspace] = workspaces.splice(from, 1);
  workspaces.splice(to, 0, workspace);
  return { ...state, workspaces };
}

function cleanName(value: string, fallback: string): string {
  const valueTrimmed = value.trim().slice(0, 80);
  return valueTrimmed || fallback;
}
