import { useCallback, type Dispatch } from "react";

import { blockIds, findLeaf } from "./layout";
import type { Workspace, WorkspaceDocument } from "./model";
import type { WorkspaceAction } from "./reducer";
import { useFileWorkspaceController } from "./useFileWorkspaceController";
import { useGitWorkspaceController } from "./useGitWorkspaceController";
import { useNetworkWorkspaceController } from "./useNetworkWorkspaceController";
import { useTerminalWorkspaceController } from "./useTerminalWorkspaceController";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { connectionIntentKey } from "./workspaceRuntime";

export function useWorkspaceRuntimeController(state: WorkspaceRuntimeState, document: WorkspaceDocument, dispatch: Dispatch<WorkspaceAction>) {
  const terminal = useTerminalWorkspaceController(state, dispatch);
  const files = useFileWorkspaceController(state, dispatch);
  const network = useNetworkWorkspaceController(state, dispatch);
  const git = useGitWorkspaceController(state, dispatch);
  const {
    runtimes, fileRuntimes, networkRuntimes, gitRuntimes, documentRef, connectionTargetIntents,
    writers, clearers, terminalSizeReaders, writerOwners, pendingTerminalOutput, pendingInitialDirectories,
    runtimesRef, fileRuntimesRef, networkRuntimesRef, gitRuntimesRef,
    setRuntimes, setFileRuntimes, setNetworkRuntimes, setGitRuntimes,
  } = state;

  const isConnectionTargetCurrent = useCallback((owner: "terminal" | "files" | "network" | "git", blockId: string, profileId: string) => {
    const intentKey = connectionIntentKey(owner, blockId);
    if (connectionTargetIntents.current.has(intentKey)) return connectionTargetIntents.current.get(intentKey) === profileId;
    for (const workspace of documentRef.current.workspaces) {
      const leaf = findLeaf(workspace.layout, blockId);
      if (!leaf || leaf.type !== owner) continue;
      if (leaf.type === "git") return leaf.target.type === "remote" && leaf.target.profileId === profileId;
      return leaf.profileId === profileId;
    }
    return false;
  }, [connectionTargetIntents, documentRef]);
  const connectedCount = useCallback((ids: string[]) => ids.filter((id) => Boolean(runtimes[id]?.sessionId || fileRuntimes[id]?.sessionId || networkRuntimes[id]?.sessionId || gitRuntimes[id]?.sessionId)).length, [fileRuntimes, gitRuntimes, networkRuntimes, runtimes]);
  const blocksForWorkspace = useCallback((workspace: Workspace) => blockIds(workspace.layout), []);

  const closeSessions = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map(async (id) => {
      if (runtimesRef.current[id]) await terminal.closeCurrentSession(id);
      if (fileRuntimesRef.current[id]) await files.closeCurrentFileSession(id);
      if (networkRuntimesRef.current[id]) await network.closeCurrentNetworkSession(id);
      if (gitRuntimesRef.current[id]) await git.closeCurrentGitSession(id);
      writers.current.delete(id);
      clearers.current.delete(id);
      terminalSizeReaders.current.delete(id);
      writerOwners.current.delete(id);
      pendingTerminalOutput.current.delete(id);
      pendingInitialDirectories.current.delete(id);
      connectionTargetIntents.current.delete(connectionIntentKey("terminal", id));
      connectionTargetIntents.current.delete(connectionIntentKey("files", id));
      connectionTargetIntents.current.delete(connectionIntentKey("network", id));
      connectionTargetIntents.current.delete(connectionIntentKey("git", id));
    }));
    setRuntimes((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      runtimesRef.current = next;
      return next;
    });
    setFileRuntimes((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      fileRuntimesRef.current = next;
      return next;
    });
    setNetworkRuntimes((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      networkRuntimesRef.current = next;
      return next;
    });
    setGitRuntimes((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      gitRuntimesRef.current = next;
      return next;
    });
  }, [clearers, connectionTargetIntents, fileRuntimesRef, files, git, gitRuntimesRef, network, networkRuntimesRef, pendingInitialDirectories, pendingTerminalOutput, runtimesRef, setFileRuntimes, setGitRuntimes, setNetworkRuntimes, setRuntimes, terminal, terminalSizeReaders, writerOwners, writers]);

  const activeWorkspace = document.workspaces.find((workspace) => workspace.id === document.activeWorkspaceId) ?? document.workspaces[0];
  return {
    runtimes, fileRuntimes, networkRuntimes, gitRuntimes, localTerminalCapabilities: state.localTerminalCapabilities,
    activeWorkspace, activeBlockId: activeWorkspace.activeBlockId,
    ...terminal, ...files, ...network, ...git,
    isConnectionTargetCurrent, connectedCount, closeSessions, blocksForWorkspace,
  };
}
