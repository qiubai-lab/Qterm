import { blockIds, closeTerminal, findLeaf, moveTerminal, setFilesPath, setFilesProfile, setNetworkProfile, setTerminalProfile, splitTerminal, terminalBlockIds, updateSplitRatio, type DropPosition } from "./layout";
import { createFilesNode, createId, createNetworkNode, createTerminalNode, createWorkspace, type SplitDirection, type Workspace, type WorkspaceDocument } from "./model";

export type WorkspaceAction =
  | { type: "hydrate"; document: WorkspaceDocument }
  | { type: "selectWorkspace"; workspaceId: string }
  | { type: "addWorkspace" }
  | { type: "renameWorkspace"; workspaceId: string; name: string }
  | { type: "closeWorkspace"; workspaceId: string }
  | { type: "reorderWorkspace"; workspaceId: string; targetWorkspaceId: string }
  | { type: "selectBlock"; workspaceId: string; blockId: string }
  | { type: "splitBlock"; workspaceId: string; blockId: string; direction: SplitDirection }
  | { type: "openFiles"; workspaceId: string; anchorBlockId: string; profileId: string | null; path: string }
  | { type: "openNetwork"; workspaceId: string; anchorBlockId: string; profileId: string | null }
  | { type: "closeBlock"; workspaceId: string; blockId: string }
  | { type: "resizeSplit"; workspaceId: string; splitId: string; ratio: number }
  | { type: "setBlockProfile"; workspaceId: string; blockId: string; profileId: string | null }
  | { type: "setFilesPath"; workspaceId: string; blockId: string; path: string }
  | { type: "setFilesProfile"; workspaceId: string; blockId: string; profileId: string | null }
  | { type: "setNetworkProfile"; workspaceId: string; blockId: string; profileId: string | null }
  | { type: "moveBlock"; workspaceId: string; sourceId: string; targetId: string; position: DropPosition };

export function workspaceReducer(state: WorkspaceDocument, action: WorkspaceAction): WorkspaceDocument {
  switch (action.type) {
    case "hydrate": return action.document;
    case "selectWorkspace": return state.workspaces.some((workspace) => workspace.id === action.workspaceId) ? { ...state, activeWorkspaceId: action.workspaceId } : state;
    case "addWorkspace": {
      const workspace = createWorkspace(`Workspace ${state.workspaces.length + 1}`);
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
    case "selectBlock": return mapWorkspace(state, action.workspaceId, (workspace) => blockIds(workspace.layout).includes(action.blockId) ? { ...workspace, activeBlockId: action.blockId } : workspace);
    case "splitBlock": return mapWorkspace(state, action.workspaceId, (workspace) => {
      const terminal = createTerminalNode();
      return { ...workspace, activeBlockId: terminal.blockId, layout: splitTerminal(workspace.layout, action.blockId, action.direction, terminal, createId("split")) };
    });
    case "openFiles": return mapWorkspace(state, action.workspaceId, (workspace) => {
      const files = createFilesNode(action.profileId, action.path);
      return { ...workspace, activeBlockId: files.blockId, layout: splitTerminal(workspace.layout, action.anchorBlockId, "horizontal", files, createId("split")) };
    });
    case "openNetwork": return mapWorkspace(state, action.workspaceId, (workspace) => {
      const network = createNetworkNode(action.profileId);
      return { ...workspace, activeBlockId: network.blockId, layout: splitTerminal(workspace.layout, action.anchorBlockId, "horizontal", network, createId("split")) };
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
    case "setFilesPath": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, layout: setFilesPath(workspace.layout, action.blockId, action.path) }));
    case "setFilesProfile": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, layout: setFilesProfile(workspace.layout, action.blockId, action.profileId) }));
    case "setNetworkProfile": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, layout: setNetworkProfile(workspace.layout, action.blockId, action.profileId) }));
    case "moveBlock": return mapWorkspace(state, action.workspaceId, (workspace) => ({ ...workspace, activeBlockId: action.sourceId, layout: moveTerminal(workspace.layout, action.sourceId, action.targetId, action.position, createId("split")) }));
  }
}

function mapWorkspace(state: WorkspaceDocument, id: string, update: (workspace: Workspace) => Workspace): WorkspaceDocument {
  return { ...state, workspaces: state.workspaces.map((workspace) => workspace.id === id ? update(workspace) : workspace) };
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
