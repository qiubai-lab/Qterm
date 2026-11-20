import { useWorkspace } from "./WorkspaceProvider";

export interface WorkspaceBatchActions {
  countSessions(workspaceIds: string[]): number;
  prepareClose(anchorId: string, workspaceIds: string[]): Promise<() => void>;
}

export function useWorkspaceBatchActions(): WorkspaceBatchActions {
  const { document, blocksForWorkspace, connectedCount, closeSessions, dispatch } = useWorkspace();
  const blocks = (ids: string[]) => [...new Set(document.workspaces.filter(item => ids.includes(item.id)).flatMap(blocksForWorkspace))];
  return {
    countSessions: ids => connectedCount(blocks(ids)),
    prepareClose: async (anchorId, workspaceIds) => {
      await closeSessions(blocks(workspaceIds));
      return () => dispatch({ type: "closeWorkspaces", anchorId, workspaceIds });
    },
  };
}
