import { createContext, useMemo } from "react";
import type { WorkspaceContextValue } from "./WorkspaceProvider";

/** Panels consume history and runtime capabilities; selecting a different tab changes neither. */
export function useWorkspaceBlockValue({
  document: { recentProfileIds, recentGitRepositories },
    dispatch, hydrated, webTabSessions, profiles, profileGroups, runtimes, fileRuntimes,
    networkRuntimes, gitRuntimes, localTerminalCapabilities, registerWriter, setBlockCwd,
    startLocalBlock, writeBlock, resizeBlock, clearBlockBuffer, splitTerminalBlock, selectBlockTarget,
    disconnectBlock, restartLocalBlock, selectFileTarget, disconnectFileBlock, selectNetworkTarget,
    disconnectNetworkBlock, startNetworkBlockRule, stopNetworkBlockRule, selectGitTarget,
    stageGitRemoteTarget, cancelStagedGitTarget, disconnectGitBlock, registerWebOpener,
}: WorkspaceContextValue) {
  return useMemo(() => ({
    document: { recentProfileIds, recentGitRepositories },
    dispatch, hydrated, webTabSessions, profiles, profileGroups, runtimes, fileRuntimes,
    networkRuntimes, gitRuntimes, localTerminalCapabilities, registerWriter, setBlockCwd,
    startLocalBlock, writeBlock, resizeBlock, clearBlockBuffer, splitTerminalBlock, selectBlockTarget,
    disconnectBlock, restartLocalBlock, selectFileTarget, disconnectFileBlock, selectNetworkTarget,
    disconnectNetworkBlock, startNetworkBlockRule, stopNetworkBlockRule, selectGitTarget,
    stageGitRemoteTarget, cancelStagedGitTarget, disconnectGitBlock, registerWebOpener,
  }), [
    recentProfileIds, recentGitRepositories,
    dispatch, hydrated, webTabSessions, profiles, profileGroups, runtimes, fileRuntimes,
    networkRuntimes, gitRuntimes, localTerminalCapabilities, registerWriter, setBlockCwd,
    startLocalBlock, writeBlock, resizeBlock, clearBlockBuffer, splitTerminalBlock, selectBlockTarget,
    disconnectBlock, restartLocalBlock, selectFileTarget, disconnectFileBlock, selectNetworkTarget,
    disconnectNetworkBlock, startNetworkBlockRule, stopNetworkBlockRule, selectGitTarget,
    stageGitRemoteTarget, cancelStagedGitTarget, disconnectGitBlock, registerWebOpener,
  ]);
}

export const WorkspaceBlockContext = createContext<ReturnType<typeof useWorkspaceBlockValue> | null>(null);
